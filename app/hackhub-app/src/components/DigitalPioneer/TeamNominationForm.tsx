import { Alert, Button, Card, FileInput, Grid, Group, Image, Select, Stack, Text, TextInput, Title } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import { notifications } from '@mantine/notifications'
import { getDigitalPioneerTracks } from '../../config/digitalPioneer'
import { IdeaService, type CreateIdeaInput, type Idea, type ProjectAttachment } from '../../services/ideaService'
import { PHOTO_ACCEPT, StorageService, validatePersonalPhoto } from '../../services/storageService'
import type { AuthUser } from '../../store/authStore'
import { CoreTeamMembersInput } from './CoreTeamMembersInput'
import { NominationDraftStore, nominationDraftKey, type NominationDraft } from '../../services/nominationDraftStore'
import { LocalNominationAttachment } from './LocalNominationAttachment'
import { NominationEvidence } from './NominationEvidence'
import { NominationAnswerBody, NominationAnswerEditor } from './NominationAnswer'
import { NominationReview } from './NominationReview'
import { isNomineeDepartmentWarning } from '../../lib/nominationStatus'
import { formattedAnswers, teamAnswerHeadings, type AnswerFormats } from '../../lib/nominationFormatting'

interface Props {
  user: AuthUser
  hackathonId: string
  category: string
  onCategoryChange: (category: string) => void
  canSubmit: boolean
  editing?: Idea | null
  restoredDraft?: TeamNominationDraft | null
  onDraftRestored: () => void
  onDraftSaved: (category: string, draft: NominationDraft<TeamNominationDraft>) => void
  onSubmitted: (idea: Idea, draftWarning?: string) => void
}

const documentAccept = '.pdf,.txt,.md,.zip'
const countWords = (text: string) => text.trim() ? text.trim().split(/\s+/u).length : 0
const validateTeamPhoto = (file: File | null) => file && file.size > 10 * 1024 * 1024
  ? 'Team photo exceeds 10 MB. Please choose a smaller photo.' : validatePersonalPhoto(file)

export interface TeamNominationDraft {
  category: string
  projectName: string
  coreTeamMembers: string
  achievementSummary: string
  teamAchievementImpact: string
  cultureDemonstration: string
  formats?: AnswerFormats
  photo: File | null
  document: File | null
  approvalVersion?: number
}

export function TeamNominationForm({
  user, hackathonId, category, onCategoryChange, canSubmit, editing,
  restoredDraft, onDraftRestored, onDraftSaved, onSubmitted,
}: Props) {
  const metadata = editing?.projectAttachments?.find((item) => item.type === 'nomination')
  const draftKey = nominationDraftKey({ userId: user.id, hackathonId, nominationType: 'team', editId: editing?.id, category })
  const currentDraftKey = useRef(draftKey)
  currentDraftKey.current = draftKey
  const [categoryForms, setCategoryForms] = useState<Record<string, TeamNominationDraft>>({})
  const initialForm: TeamNominationDraft = {
    category, projectName: metadata?.projectName ?? '', coreTeamMembers: metadata?.coreTeamMembers ?? '',
    achievementSummary: metadata?.achievementSummary ?? '', teamAchievementImpact: metadata?.teamAchievementImpact ?? '',
    cultureDemonstration: metadata?.cultureDemonstration ?? '', formats: metadata?.formattedAnswers, photo: null, document: null,
  }
  const { projectName, coreTeamMembers, achievementSummary, teamAchievementImpact, cultureDemonstration, formats, photo, document } = categoryForms[draftKey] ?? initialForm
  const updateForm = (fields: Partial<TeamNominationDraft>) => setCategoryForms((current) => ({
    ...current, [draftKey]: { ...(current[draftKey] ?? initialForm), ...fields },
  }))
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reviewOpened, setReviewOpened] = useState(false)
  const [draftSaving, setDraftSaving] = useState(false)
  const [draftMessage, setDraftMessage] = useState<string | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)
  const busyRef = useRef(false)
  const savedPhoto = editing?.projectAttachments?.find((item) => item.type === 'screenshot')
  const savedDocuments = editing?.projectAttachments?.filter((item) => item.type === 'document') ?? []
  const photoError = validateTeamPhoto(photo)
  const documentError = document && (document.size === 0 ? 'The selected attachment is empty.'
    : document.size >= 20 * 1024 * 1024 ? 'Attachment must be less than 20 MB.' : null)
  const summaryWords = countWords(achievementSummary)

  useEffect(() => {
    setDraftMessage(null)
    setDraftError(null)
    setReviewError(null)
    setReviewOpened(false)
  }, [draftKey])

  useEffect(() => {
    if (!restoredDraft || restoredDraft.category !== category) return
    setCategoryForms((current) => ({ ...current, [draftKey]: restoredDraft }))
    onDraftRestored()
  }, [category, draftKey, restoredDraft, onDraftRestored])

  const saveDraft = async () => {
    if (draftSaving || busy) return
    setDraftSaving(true)
    setDraftError(null)
    setDraftMessage(null)
    try {
      const draft = await NominationDraftStore.save<TeamNominationDraft>(draftKey, {
        category, projectName, coreTeamMembers, achievementSummary, teamAchievementImpact, cultureDemonstration,
        formats, photo, document, approvalVersion: editing?.approvalVersion,
      })
      onDraftSaved(category, draft)
      if (currentDraftKey.current === draftKey) {
        setDraftMessage('Draft saved successfully.')
        notifications.show({ message: 'Draft saved successfully.', color: 'green', autoClose: 4000, className: 'dp-status-toast' })
      }
    } catch {
      if (currentDraftKey.current === draftKey) setDraftError('Unable to save your draft. Check available browser storage and retry before leaving.')
    } finally { setDraftSaving(false) }
  }

  useEffect(() => {
    let active = true
    if (photo && !validateTeamPhoto(photo)) {
      const url = URL.createObjectURL(photo)
      setPhotoPreview(url)
      return () => URL.revokeObjectURL(url)
    }
    setPhotoPreview(null)
    if (savedPhoto) {
      const request = savedPhoto.storageKey
        ? StorageService.getPresignedUrl('project-attachments', savedPhoto.storageKey)
        : Promise.resolve(savedPhoto.url)
      void request.then((url) => { if (active) setPhotoPreview(url) }).catch(() => undefined)
    }
    return () => { active = false }
  }, [photo, savedPhoto])

  const submit = async (confirmed = false) => {
    if (!canSubmit || busyRef.current) return
    setReviewError(null)
    const missing = [
      !projectName.trim() && 'project name',
      !category && 'award category',
      !coreTeamMembers.trim() && 'team members',
      !achievementSummary.trim() && 'achievement summary',
      !teamAchievementImpact.trim() && 'business impact',
      !cultureDemonstration.trim() && 'culture example',
      !photo && !savedPhoto && 'team photo',
    ].filter(Boolean)
    if (missing.length) {
      notifications.show({
        title: 'Missing Information',
        message: `Please add: ${missing.join(', ')}.`,
        color: 'orange',
        position: 'bottom-right',
        className: 'dp-status-toast dp-missing-information-toast',
      })
      return
    }
    if (summaryWords > 200 || photoError || documentError) {
      notifications.show({ title: 'Invalid nomination', message: photoError || documentError || 'Achievement Summary must be 200 words or fewer.', color: 'orange', position: 'bottom-right' })
      return
    }
    if (coreTeamMembers.split(';').some((name) => !name.trim()) || /[；\n\r]/u.test(coreTeamMembers)) {
      notifications.show({ title: 'Invalid team members', message: 'Enter Outlook names separated by semicolons (;), without empty names.', color: 'orange', position: 'bottom-right' })
      return
    }
    // 首次点击只展示确认页，第二次确认才沿用原上传和提交审批流程。
    if (!confirmed) { setReviewOpened(true); return }
    busyRef.current = true
    setBusy(true)
    try {
      const prefix = `nominations/${hackathonId}/${user.id}`
      const [uploadedPhoto, uploadedDocument] = await Promise.all([
        photo ? StorageService.uploadFile(photo, 'project-attachments', prefix) : null,
        document ? StorageService.uploadFile(document, 'project-attachments', prefix) : null,
      ])
      const attachments: ProjectAttachment[] = [{
        type: 'nomination', nominationType: 'team', url: '', name: projectName.trim(), nomineeUserId: user.id,
        projectName: projectName.trim(), coreTeamMembers: coreTeamMembers.trim(), achievementSummary: achievementSummary.trim(),
        teamAchievementImpact: teamAchievementImpact.trim(), cultureDemonstration: cultureDemonstration.trim(),
        formattedAnswers: formattedAnswers([achievementSummary, teamAchievementImpact, cultureDemonstration], formats),
      }]
      if (uploadedPhoto && photo) attachments.push({ type: 'screenshot', name: photo.name, url: uploadedPhoto.url, storageKey: uploadedPhoto.key })
      else if (savedPhoto) attachments.push(savedPhoto)
      if (uploadedDocument && document) attachments.push({ type: 'document', name: document.name, url: uploadedDocument.url, storageKey: uploadedDocument.key })
      else attachments.push(...savedDocuments)
      const payload: CreateIdeaInput = {
        title: projectName.trim(), hackathonId, teamId: editing?.teamId ?? undefined, category, status: 'submitted', tags: [],
        description: [
          `Achievement Summary\n${achievementSummary.trim()}`,
          `Details of Your Team Achievement in 2026 and Business Impact\n${teamAchievementImpact.trim()}`,
          `How You Demonstrate BD China Culture (Especially in Your Applied Category)\n${cultureDemonstration.trim()}`,
        ].join('\n\n'),
        projectAttachments: attachments,
      }
      const result = editing
        ? await IdeaService.updateIdea(editing.id, { ...payload, approvalVersion: editing.approvalVersion })
        : await IdeaService.createIdea(payload)
      let draftWarning: string | undefined
      // 提交已成功时，草稿清理失败只提示用户，不重复提交提名。
      await NominationDraftStore.remove(draftKey).catch(() => {
        draftWarning = 'Your nomination was submitted, but its saved draft could not be removed.'
      })
      setReviewOpened(false)
      onSubmitted(result, draftWarning)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to submit the team nomination. Please retry.'
      if (isNomineeDepartmentWarning(message)) {
        setReviewError(message)
      } else {
        notifications.show({ title: 'Submission failed', message, color: 'red', position: 'bottom-right' })
      }
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return <Card className="dp-form-shell dp-team-nomination-form" p={{ base: 'lg', md: 38 }}><Stack gap="lg" id="nomination-form">
    <Title order={3}>Team Nomination</Title>
    {draftError && <Alert color="red" c="white" styles={{ message: { color: '#fff' } }}>{draftError}</Alert>}
    {draftMessage && <Alert color="blue" c="white" role="status" styles={{ message: { color: '#fff' } }}>{draftMessage}</Alert>}
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, sm: 6 }}><TextInput label="Nominator Name" value={metadata?.nominatorName ?? user.name} readOnly required /></Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}><Select label="Award Category" required allowDeselect={false} disabled={busy || Boolean(editing)}
          data={getDigitalPioneerTracks('team').map((track) => ({ value: track.value, label: track.label }))}
          value={category} onChange={(value) => { if (value) onCategoryChange(value) }} /></Grid.Col>
        <Grid.Col span={12}><TextInput label="Project Name" required value={projectName} maxLength={200} disabled={busy} onChange={(event) => updateForm({ projectName: event.currentTarget.value })} /></Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <FileInput className="dp-team-file-input" label="Team Photo" placeholder="JPG, PNG or WebP; up to 10 MB per photo." required clearable
            accept={PHOTO_ACCEPT} value={photo} disabled={busy} onChange={(photo) => updateForm({ photo })} error={photoError} />
          {savedPhoto && <Text size="sm">Your submitted team photo is retained unless you upload a replacement.</Text>}
          {photoPreview && <Image src={photoPreview} alt="Team photo preview" fit="contain" mah={240} mt="sm" />}
        </Grid.Col>
        <Grid.Col span={12}><CoreTeamMembersInput disabled={busy}
          value={coreTeamMembers} onChange={(coreTeamMembers) => updateForm({ coreTeamMembers })} /></Grid.Col>
      </Grid>
      <div className="dp-fieldset" translate="no"><NominationAnswerEditor label="Achievement Summary (≤ 200 words)" minRows={8} disabled={busy}
        placeholder="Summarize the achievement, the value created, and why it deserves the 2026 Digital Pioneer Award in this track."
        value={achievementSummary} format={formats?.[0]} error={summaryWords > 200 ? 'Maximum 200 words.' : undefined}
        onChange={(value, format) => updateForm({ achievementSummary: value, formats: { ...formats, 0: format } })} />
      </div>
      <div className="dp-fieldset" translate="no"><NominationAnswerEditor label={teamAnswerHeadings[1]} disabled={busy}
        placeholder="What were the measurable outcomes in 2026? including financial figures"
        value={teamAchievementImpact} format={formats?.[1]} onChange={(value, format) => updateForm({ teamAchievementImpact: value, formats: { ...formats, 1: format } })} /></div>
      <div className="dp-fieldset" translate="no"><NominationAnswerEditor label={teamAnswerHeadings[2]} disabled={busy}
        placeholder="Describe how the /team demonstrated the culture pillar of this track."
        value={cultureDemonstration} format={formats?.[2]} onChange={(value, format) => updateForm({ cultureDemonstration: value, formats: { ...formats, 2: format } })} /></div>
      <div className="dp-fieldset" translate="no"><FileInput className="dp-team-file-input dp-team-attachment" label="Attachment" clearable disabled={busy} accept={documentAccept}
        placeholder="Optional supplementary materials, document size less than 20 MB"
        value={document} onChange={(document) => updateForm({ document })} error={documentError} />
        {document && !documentError && <LocalNominationAttachment file={document} />}
        {!document && savedDocuments.map((item) => <Stack key={item.storageKey ?? item.url} gap="xs"><Text size="sm">Retained attachment: {item.name}</Text><NominationEvidence attachment={item} /></Stack>)}
      </div>
      <Group justify="flex-end"><Button className="dp-primary-button" loading={draftSaving} disabled={busy} onClick={() => void saveDraft()}>Save Draft</Button>
        <Button className="dp-primary-button" loading={busy}
        disabled={!canSubmit || summaryWords > 200 || Boolean(photoError || documentError)} onClick={() => void submit()}>
        {editing ? 'Resubmit nomination' : 'Submit nomination'}
      </Button></Group>
      <NominationReview opened={reviewOpened} title="Review Team Nomination" busy={busy} canSubmit={canSubmit} submissionError={reviewError}
        onClose={() => setReviewOpened(false)} onConfirm={() => void submit(true)}>
        <Stack gap="lg" style={{ minWidth: 0 }}>
          <Title order={3}>{getDigitalPioneerTracks('team').find((track) => track.value === category)?.label ?? category}</Title>
          <Text><strong>Name:</strong> {metadata?.nominatorName ?? user.name}</Text>
          <Text style={{ overflowWrap: 'anywhere' }}><strong>Project Name:</strong> {projectName}</Text>
          {photoPreview && <Image src={photoPreview} alt="Team nomination photo" fit="contain" w="100%" h={280} style={{ display: 'block', position: 'static', maxWidth: '100%' }} />}
          <section><Title order={4}>Core Team Member</Title><NominationAnswerBody text={coreTeamMembers} /></section>
          {([0, 1, 2] as const).map((index) => (
            <section key={teamAnswerHeadings[index]}><Title order={4}>{teamAnswerHeadings[index]}</Title>
              <NominationAnswerBody text={[achievementSummary, teamAchievementImpact, cultureDemonstration][index]} format={formats?.[index]} />
            </section>
          ))}
          {document ? <LocalNominationAttachment file={document} /> : savedDocuments.map((item) => <NominationEvidence key={item.storageKey ?? item.url} attachment={item} />)}
        </Stack>
      </NominationReview>
  </Stack></Card>
}
