import { useId, useState } from 'react'
import type { ReactElement } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Container,
  Grid,
  Group,
  Loader,
  Modal,
  Popover,
  Input,
  NativeSelect,
  Stack,
  Text,
  Textarea,
  ThemeIcon,
  Title,
  Tooltip,
  UnstyledButton,
  VisuallyHidden,
} from '@mantine/core'
import {
  IconAlertCircle,
  IconArrowLeft,
  IconChevronDown,
  IconChevronUp,
  IconClipboardCheck,
  IconExternalLink,
  IconInfoCircle,
  IconTrophy,
} from '@tabler/icons-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { DIGITAL_PIONEER_TRACKS, normalizeDigitalPioneerTrack } from '../config/digitalPioneer'
import type { NominationType } from '../config/digitalPioneer'
import { useNominationEligibility } from '../hooks/useNominationEligibility'
import { useAuthStore } from '../store/authStore'
import { loadAllNominations, officialCriteria, savedEvaluation, criteriaForNomination, nominationDepartment, matchesNominationFilters } from '../utils/committeeScoring'
import type { JudgeScore } from '../services/judgingService'
import type { Idea, ProjectAttachment } from '../services/ideaService'
import { StorageService } from '../services/storageService'
import { JudgingService } from '../services/judgingService'
import { VotingService } from '../services/votingService'
import type { VotingCriteria } from '../services/votingService'
import { PermissionService } from '../utils/permissions'
import { parseNominationDescription } from '../lib/nominationDescription'
import { isTeamNomination } from '../lib/nominationStatus'
import { NominationAnswerDetails } from '../components/DigitalPioneer/NominationAnswer'
import { NominationFilters, NominationTypeSwitch, type NominationFilterValues } from '../components/DigitalPioneer/NominationFilters'
import { NominationEvidence } from '../components/DigitalPioneer/NominationEvidence'
import './DigitalPioneer.css'

interface IdeaScores {
  [criteriaId: string]: number | ''
}

interface ScoreSubmission {
  ideaId: string
  scores: IdeaScores
  comment: string
}

const scoreOptions = [{ value: '', label: 'Select score', disabled: true },
  ...Array.from({ length: 10 }, (_, index) => String(index + 1))]

function getScoreTone(score: number): string {
  if (score >= 9) return 'grape'
  if (score >= 7) return 'green'
  if (score >= 5) return 'yellow'
  return 'red'
}

function isImageAttachment(attachment: ProjectAttachment): boolean {
  return attachment.type !== 'nomination' && (attachment.type === 'screenshot'
    || /\.(png|jpe?g|webp|gif|avif|bmp)(?:[?#]|$)/i.test(attachment.name || attachment.storageKey || attachment.url))
}

function JudgingImage({ attachment }: { attachment: ProjectAttachment }) {
  const [opened, setOpened] = useState(false)
  const [imageError, setImageError] = useState(false)
  const { data: url, isError, isFetching, refetch } = useQuery({
    queryKey: ['judging-image', attachment.storageKey, attachment.url],
    queryFn: async () => {
      if (attachment.storageKey) return StorageService.getPresignedUrl('project-attachments', attachment.storageKey)
      if (/^https?:\/\//i.test(attachment.url) || attachment.url.startsWith('/storage/')) return attachment.url
      throw new Error('Unable to load attachment.')
    },
    staleTime: 50 * 60 * 1000,
    refetchInterval: 50 * 60 * 1000,
  })
  const failed = isError || imageError

  return <>
    <UnstyledButton
      aria-label={failed ? 'Retry image' : `Preview ${attachment.name || 'image'}`}
      onClick={() => {
        if (failed) { setImageError(false); void refetch() }
        else if (url) setOpened(true)
      }}
      disabled={isFetching && !url}
      w={96} h={112}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', background: 'transparent', border: 0, borderRadius: 0 }}
    >
      {failed ? <Text size="xs" ta="center">Unable to load image. Retry</Text> : url ? (
        <img src={url} alt={attachment.name || 'Nomination image'} width={96} height={112}
          style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }} onError={() => setImageError(true)} />
      ) : <Loader size="sm" />}
    </UnstyledButton>
    <Modal opened={opened} onClose={() => setOpened(false)} centered size="auto" title={attachment.name || 'Image Preview'}
      closeButtonProps={{ 'aria-label': 'Close image preview' }} styles={{
        content: { maxWidth: 'calc(100vw - 32px)', background: 'transparent', boxShadow: 'none' },
        header: { background: 'transparent' },
      }}>
      {url && <img src={url} alt={attachment.name || 'Nomination image'}
        style={{ display: 'block', maxWidth: '100%', maxHeight: '75dvh', objectFit: 'contain', margin: '0 auto' }} />}
    </Modal>
  </>
}

interface IdeaJudgingCardProps {
  idea: Idea
  criteria: VotingCriteria[]
  onSubmit: (submission: ScoreSubmission) => void
  onCollapse?: () => void
  isSubmitting: boolean
  alreadyScored: boolean
  savedScores: JudgeScore[]
  canSubmitRating: boolean
}

function IdeaJudgingCard({
  idea,
  criteria,
  onSubmit,
  onCollapse,
  isSubmitting,
  alreadyScored,
  savedScores,
  canSubmitRating,
}: IdeaJudgingCardProps): ReactElement {
  const scoreId = useId()
  const nominee = idea.projectAttachments?.find((attachment) => attachment.type === 'nomination')
  const images = (idea.projectAttachments ?? []).filter(isImageAttachment)
  const saved = savedEvaluation(savedScores)
  const [scores, setScores] = useState<IdeaScores>(() =>
    Object.fromEntries(criteria.map((criterion) => [criterion.id, saved.scores[criterion.id] ?? '']))
  )
  const [comment, setComment] = useState(saved.comment)

  const weightedScore = criteria.reduce(
    (total, criterion) => total + Number(scores[criterion.id] || 0) * (criterion.weight / 100),
    0
  )
  const canSubmit = canSubmitRating && criteria.length > 0
    && criteria.every((criterion) => Number.isInteger(scores[criterion.id]) && Number(scores[criterion.id]) >= 1 && Number(scores[criterion.id]) <= 10)

  return (
    <Card className="dp-judge-shell" p={{ base: 'lg', md: 32 }} pos="relative">
      {onCollapse && <ActionIcon variant="subtle" disabled={isSubmitting} aria-expanded
        pos="absolute" top={24} right={24} style={{ zIndex: 1 }}
        aria-label={`Collapse rating for ${idea.title}`} onClick={onCollapse}>
        <IconChevronUp size={18} />
      </ActionIcon>}
      <Grid gutter={{ base: 24, md: 38 }} mt={onCollapse ? { base: 'xl', lg: 0 } : undefined}>
        <Grid.Col span={{ base: 12, lg: 4 }} style={{ display: 'flex', minWidth: 0 }}>
          <Box pos="relative" w="100%" mih={{ base: 540, lg: 0 }}>
            <Stack gap="md" className="dp-judge-material" role="region" aria-label="Nomination details" tabIndex={0}>
              <Group align="flex-start" wrap="nowrap" gap="sm">
                <Stack gap="md" style={{ flex: 1, minWidth: 0 }}>
                  <Group gap="xs">
                    <Badge variant="light" color="grape">{idea.category}</Badge>
                  </Group>
                  <Title order={3}>{idea.title}</Title>
                </Stack>
                {images.length > 0 && <Stack gap="xs" w={96} style={{ flexShrink: 0 }}>
                  {images.map((attachment) => <JudgingImage key={attachment.storageKey || attachment.url} attachment={attachment} />)}
                </Stack>}
              </Group>
              <Stack gap="md">
                <Stack gap="md" className="dp-judge-answers">
                  {nominee?.formattedAnswers ? <NominationAnswerDetails answers={nominee.formattedAnswers} team={isTeamNomination(idea)} />
                    : parseNominationDescription(idea.description, isTeamNomination(idea) ? 'team' : 'individual').map(({ heading, body }, index) => (
                      <section key={index}>
                        {heading && <Title order={4}>{heading}</Title>}
                        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{body}</Text>
                      </section>
                    ))}
                </Stack>
                <Stack gap="xs">
                  {(idea.projectAttachments ?? []).filter((attachment) => attachment.type !== 'nomination' && !isImageAttachment(attachment)).map((attachment) => (
                    <NominationEvidence key={attachment.storageKey || attachment.url} attachment={attachment} />
                  ))}
                  {idea.repositoryUrl ? (
                    <Button component="a" href={idea.repositoryUrl} target="_blank" variant="light" rightSection={<IconExternalLink size={15} />}>
                      Review evidence
                    </Button>
                  ) : null}
                  {idea.demoUrl ? (
                    <Button component="a" href={idea.demoUrl} target="_blank" variant="subtle" rightSection={<IconExternalLink size={15} />}>
                      Open demo
                    </Button>
                  ) : null}
                </Stack>
                <div className="dp-fieldset">
                  <Text size="sm"><b>Nominee:</b> {nominee?.name ?? 'Not provided'}</Text>
                  <Text size="sm"><b>Org. code:</b> {nominee?.nomineeOrgCode ?? 'Not provided'}</Text>
                  <Text size="sm"><b>Position:</b> {nominee?.nomineePosition ?? 'Not provided'}</Text>
                  <Text size="sm"><b>Nominating HoD:</b> {nominee?.nominatingHead ?? 'Not provided'}</Text>
                </div>
                <Group gap="xs">
                  {idea.tags.slice(0, 4).map((tag) => <Badge key={tag} size="sm" variant="outline">{tag}</Badge>)}
                </Group>
              </Stack>
            </Stack>
          </Box>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Stack gap="xl">
            <Title order={3}>Score the Evidence</Title>

            {criteria.map((criterion, index) => {
              const score = scores[criterion.id] ?? ''
              const numericScore = Number(score)
              const inputId = `${scoreId}-${criterion.id}`
              return (
                <div className={index === 0 ? undefined : 'dp-fieldset'} key={criterion.id}>
                  <Group justify="space-between" align="flex-start" mb="lg">
                    <div>
                      <Group gap="xs">
                        <Text fw={800}>{criterion.name}</Text>
                        <Badge variant="filled" color="dark">{criterion.weight}%</Badge>
                      </Group>
                    </div>
                    <Badge key={String(score)} color={getScoreTone(numericScore)} variant="light" size="lg">
                      {score === '' ? <span>Not scored</span> : <><span>{score} · </span><span>{'/ 10'}</span></>}
                    </Badge>
                  </Group>
                  <Group gap={4} mb={4}>
                    <Input.Label htmlFor={inputId} required>{criterion.name} score</Input.Label>
                    {criterion.description && <Popover width={300} position="bottom-start" withArrow>
                      <Popover.Target>
                        <ActionIcon variant="subtle" size="sm" color="gray" aria-label={`About ${criterion.name}`} aria-describedby={`${inputId}-help`}>
                          <IconInfoCircle size={16} />
                        </ActionIcon>
                      </Popover.Target>
                      <Popover.Dropdown><Text size="sm">{criterion.description}</Text></Popover.Dropdown>
                    </Popover>}
                  </Group>
                  {criterion.description && <VisuallyHidden id={`${inputId}-help`}>{criterion.description}</VisuallyHidden>}
                  <NativeSelect id={inputId} required value={score} data={scoreOptions}
                    onChange={(event) => {
                      const value = Number(event.currentTarget.value)
                      setScores((current) => ({ ...current, [criterion.id]: value }))
                    }}
                    disabled={!canSubmitRating || isSubmitting} size="md" maw={320} />
                </div>
              )
            })}

            <Textarea label="Comments, if any" disabled={!canSubmitRating || isSubmitting} minRows={3}
              maxLength={1200} value={comment} onChange={(event) => setComment(event.currentTarget.value)} />
            <Group justify="space-between" align="center">
              <div>
                <Text className="dp-utility" size="sm" c="dimmed">Weighted total</Text>
                <Text className="dp-field-number" fw={700}>{criteria.every((criterion) => scores[criterion.id] !== '') ? weightedScore.toFixed(2) : '—'}</Text>
              </div>
              <Button
                className="dp-primary-button"
                leftSection={<IconClipboardCheck size={17} />}
                disabled={!canSubmit}
                loading={isSubmitting}
                onClick={() => onSubmit({
                  ideaId: idea.id,
                  scores,
                  comment,
                })}
              >
                {alreadyScored ? 'Update rating' : 'Submit rating'}
              </Button>
            </Group>
          </Stack>
        </Grid.Col>
      </Grid>
    </Card>
  )
}

export function JudgingPanel(): ReactElement {
  const { hackathonId } = useParams<{ hackathonId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [nominationType, setNominationType] = useState<NominationType>(() => searchParams.get('type') === 'individual' ? 'individual' : 'team')
  const [filters, setFilters] = useState<NominationFilterValues>({ search: '', category: '', department: '' })
  const [expandedIdeas, setExpandedIdeas] = useState<Set<string>>(() => new Set())
  const [confirmTemplate, setConfirmTemplate] = useState(false)
  const [submittingIdea, setSubmittingIdea] = useState<string | null>(null)
  const eligibility = useNominationEligibility()
  const canManageJudging = user !== null && PermissionService.isManagerOrAbove(user)

  const { data: judges, isLoading: judgeStatusLoading, error: judgeStatusError } = useQuery({
    queryKey: ['hackathon-judges', hackathonId],
    queryFn: () => JudgingService.getJudges(hackathonId!),
    enabled: Boolean(hackathonId && user),
    staleTime: 60 * 1000,
  })
  const isAssignedJudge = (judges ?? []).some((judge) => judge.userId === user?.id)
  const canReview = isAssignedJudge || eligibility.data?.canReview === true
  const canJudge = canManageJudging || canReview
  const isHoDView = !canManageJudging && eligibility.data?.canReview === true

  const { data: criteria, isLoading: criteriaLoading, error: criteriaError } = useQuery({
    queryKey: ['voting-criteria', hackathonId],
    queryFn: () => VotingService.getCriteria(hackathonId!),
    enabled: Boolean(hackathonId && canJudge),
    staleTime: 5 * 60 * 1000,
  })
  const { data: nominations, isLoading: ideasLoading, error: ideasError } = useQuery({
    queryKey: ['judging-ideas', hackathonId, user?.id],
    queryFn: () => loadAllNominations(hackathonId!),
    enabled: Boolean(hackathonId && canJudge),
    staleTime: 2 * 60 * 1000,
  })
  const { data: myScores, isLoading: scoresLoading, error: scoresError } = useQuery({
    queryKey: ['my-judge-scores', hackathonId, user?.id],
    queryFn: () => JudgingService.getMyScores(hackathonId!),
    enabled: Boolean(hackathonId && canReview),
    staleTime: 60 * 1000,
  })
  const { data: eligibleNominations, isLoading: permissionsLoading, error: permissionsError } = useQuery({
    queryKey: ['eligible-scoring-nominations', hackathonId, user?.id],
    queryFn: () => JudgingService.getEligibleNominations(hackathonId!),
    enabled: Boolean(hackathonId && canJudge),
  })
  const eligibleIds = new Set(eligibleNominations ?? [])

  const templateMutation = useMutation({
    mutationFn: () => VotingService.applyAwardTemplate(hackathonId!),
    onSuccess: (configured) => {
      queryClient.setQueryData(['voting-criteria', hackathonId], configured)
      setConfirmTemplate(false)
      notifications.show({ title: 'Evaluation form ready', message: 'The three award-category criteria are ready.', color: 'teal' })
    },
    onError: (error) => notifications.show({ title: 'Error', message: error instanceof Error ? error.message : 'Unable to configure the evaluation form.', color: 'red' }),
  })

  const ownScores = (myScores ?? []).filter((score) => score.judgeId === user?.id)
  const scoreIdeaMutation = useMutation({
    mutationFn: async (submission: ScoreSubmission) => {
      const saved = await JudgingService.submitEvaluation(hackathonId!, {
        ideaId: submission.ideaId,
        scores: Object.entries(submission.scores).map(([criterionId, score]) => ({ criterionId, score: Number(score) })),
        comment: submission.comment.trim(),
      })
      return { ideaId: submission.ideaId, saved }
    },
    onSuccess: ({ ideaId, saved }) => {
      queryClient.setQueryData<JudgeScore[]>(['my-judge-scores', hackathonId, user?.id], (current = []) =>
        [...current.filter((score) => score.ideaId !== ideaId), ...saved])
      setExpandedIdeas((current) => {
        const next = new Set(current)
        next.delete(ideaId)
        return next
      })
      setSubmittingIdea(null)
      void Promise.all(['score-summary', 'all-judge-scores'].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key, hackathonId] })))
      notifications.show({
        title: 'Rating recorded',
        message: 'The weighted total and committee ranking have been updated.',
        color: 'teal',
      })
    },
    onError: (error) => {
      setSubmittingIdea(null)
      notifications.show({
        title: 'Rating not recorded',
        message: error instanceof Error ? error.message : 'Please try again.',
        color: 'red',
      })
    },
  })

  if (judgeStatusLoading || eligibility.isLoading) {
    return <Center py={100}><Loader size="lg" /></Center>
  }

  if (judgeStatusError) return <Alert color="red">Unable to verify committee access. Please reload and try again.</Alert>

  if (!canJudge) {
    return (
      <Container size="sm" py={80}>
        <Center>
          <Stack align="center" gap="md">
            <ThemeIcon size={72} radius="xl" variant="light" color="red"><IconAlertCircle size={34} /></ThemeIcon>
            <Title order={2}>Committee Access Required</Title>
            <Text ta="center" c="dimmed">Verified roster HoDs, assigned committee members and award managers can open this evaluation form.</Text>
            <Button variant="light" onClick={() => navigate(`/awards/${hackathonId}`)}>Back to award event</Button>
          </Stack>
        </Center>
      </Container>
    )
  }

  const isLoading = criteriaLoading || ideasLoading || scoresLoading || permissionsLoading
  const error = criteriaError ?? ideasError ?? scoresError ?? permissionsError
  const ideas: Idea[] = nominations ?? []
  const submittedIdeas = ideas
    .filter((idea) => ['submitted', 'in-progress', 'completed'].includes(idea.status)
      && (!isHoDView || eligibleIds.has(idea.id)))
    .map((idea) => ({ ...idea, category: normalizeDigitalPioneerTrack(idea.category, idea.tags ?? []) }))
  const typeIdeas = submittedIdeas.filter((idea) => isTeamNomination(idea) === (nominationType === 'team'))
  const filteredIdeas = typeIdeas.filter((idea) => matchesNominationFilters(idea, filters))
  const departments = [...new Set(typeIdeas.map(nominationDepartment).filter(Boolean))].sort()
  const tracks = DIGITAL_PIONEER_TRACKS.filter((track) => !filters.category || filters.category === track.value).map((track) => ({
    ...track,
    ideas: filteredIdeas.filter((idea) => idea.category === track.value),
  }))
  const criteriaReady = officialCriteria(criteria ?? [])

  return (
    <Container size={1240} py={{ base: 'md', md: 'xl' }} className="dp-page dp-committee-page">
      <Stack gap="xl">
        <Group justify="space-between" align="flex-end">
          <div>
            <Group gap="xs" mb="md">
              <ActionIcon variant="subtle" aria-label="Back to award event" onClick={() => navigate(`/awards/${hackathonId}`)}>
                <IconArrowLeft size={18} />
              </ActionIcon>
              <Text className="dp-section-label" style={{ marginBottom: 0 }}>2026 Digital Pioneer · Committee</Text>
            </Group>
            <h1 className="dp-section-title">Committee Scoring</h1>
            {!isLoading && !error && criteriaReady && <Box mt="sm">
              <NominationTypeSwitch label="Scoring nomination type" value={nominationType} onChange={(type) => {
                setNominationType(type)
                setFilters((current) => ({ ...current, department: '' }))
              }} />
            </Box>}
          </div>
          {canManageJudging ? <Tooltip label="Open committee ranking">
            <Button
              variant="light"
              color="grape"
              leftSection={<IconTrophy size={17} />}
              onClick={() => navigate(`/hackathons/${hackathonId}/leaderboard`)}
            >
              View ranking
            </Button>
          </Tooltip> : null}
        </Group>

        {!isLoading && !error && eligibleIds.size === 0 ? <Alert styles={{ root: { backgroundColor: 'rgba(255, 255, 255, 0.12)' }, message: { color: '#fff' } }}>
          {isHoDView ? 'No nominations are assigned to you for scoring.'
            : 'You can review published nominations. Scoring is limited to the HoDs associated with each nomination.'}
        </Alert> : null}
        {!isLoading && !error && criteriaReady &&
          <NominationFilters filters={filters} onChange={setFilters} nominations={typeIdeas} departments={departments} />}

        {isLoading ? (
          <Center py={80}><Stack align="center"><Loader /><Text c="dimmed">Loading nominations…</Text></Stack></Center>
        ) : null}
        {error ? <Alert color="red" icon={<IconAlertCircle size={18} />}>{error instanceof Error ? error.message : 'Unable to load evaluation data.'}</Alert> : null}
        {!isLoading && !error && !criteriaReady ? (
          <Alert color="orange" icon={<IconAlertCircle size={18} />}>
            <Text>Configure the three award-category criteria before scoring. Historical ratings remain stored and must be reassessed against the new criteria.</Text>
            {canManageJudging && <Group mt="md"><Button onClick={() => setConfirmTemplate(true)}>Apply 2026 DPA template</Button><Button variant="light" onClick={() => navigate(`/awards/${hackathonId}`)}>Manage evaluation criteria</Button></Group>}
            {canManageJudging && confirmTemplate && <Stack mt="md" gap="sm">
              <Text>Add the three award-category criteria? Historical criteria and ratings are preserved; new totals use complete ratings under the new criteria.</Text>
              <Group><Button loading={templateMutation.isPending} onClick={() => templateMutation.mutate()}>Confirm official criteria</Button><Button variant="default" onClick={() => setConfirmTemplate(false)}>Cancel</Button></Group>
            </Stack>}
          </Alert>
        ) : null}
        {!isLoading && !error && criteriaReady ? tracks.map((track) => (
          <Stack key={track.value} gap="md" component="section" aria-label={track.label}>
            <Text component="h2" size="xl" fw={800} m={0} c="white">{track.label}</Text>
            {track.ideas.length === 0 ? (
              <Text c="white">No nominations in this category yet.</Text>
            ) : track.ideas.map((idea) => {
              const nominationCriteria = criteriaForNomination(criteria ?? [], idea)
              const savedScores = ownScores.filter((score) => score.ideaId === idea.id)
              const saved = savedEvaluation(savedScores)
              const scored = nominationCriteria.every((criterion) => saved.scores[criterion.id] !== undefined)
              const expanded = expandedIdeas.has(idea.id)
              const total = nominationCriteria.reduce((sum, criterion) => sum + (saved.scores[criterion.id] ?? 0) * criterion.weight / 100, 0)
              const toggle = () => setExpandedIdeas((current) => {
                const next = new Set(current)
                if (next.has(idea.id)) next.delete(idea.id)
                else next.add(idea.id)
                return next
              })

              if (scored && !expanded) {
                return <Card key={idea.id} className="dp-judge-shell" p="md">
                  <Group justify="space-between" wrap="nowrap">
                    <Group gap="sm" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                      <Badge color="grape" variant="light">{idea.category}</Badge>
                      <Text fw={700}>{idea.title}</Text>
                    </Group>
                    <Group gap="xs" wrap="nowrap">
                      <Text fw={700}>{total.toFixed(2)} / 10</Text>
                      <ActionIcon variant="subtle" aria-expanded={false} aria-label={`Expand rating for ${idea.title}`} onClick={toggle}>
                        <IconChevronDown size={18} />
                      </ActionIcon>
                    </Group>
                  </Group>
                </Card>
              }
              return <IdeaJudgingCard
                key={`${idea.id}-${JSON.stringify(savedScores)}`}
                savedScores={savedScores}
                canSubmitRating={eligibleIds.has(idea.id) && (!submittingIdea || submittingIdea === idea.id)}
                idea={idea}
                criteria={nominationCriteria}
                alreadyScored={scored}
                isSubmitting={submittingIdea === idea.id}
                onCollapse={scored ? toggle : undefined}
                onSubmit={(submission) => {
                  setSubmittingIdea(idea.id)
                  scoreIdeaMutation.mutate(submission)
                }}
              />
            })}
          </Stack>
        )) : null}
      </Stack>
    </Container>
  )
}
