import { Button, Card, Select, SimpleGrid, TextInput, UnstyledButton } from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import { DIGITAL_PIONEER_TRACKS } from '../../config/digitalPioneer'
import type { NominationType } from '../../config/digitalPioneer'

interface NominationTypeSwitchProps {
  value: NominationType
  onChange: (type: NominationType) => void
  label: string
}

export function NominationTypeSwitch({ value, onChange, label }: NominationTypeSwitchProps) {
  return <Button.Group className="dp-type-switch" aria-label={label}>
    {(['team', 'individual'] as const).map((type) => (
      <Button key={type} radius="xl" variant={value === type ? 'filled' : 'outline'}
        aria-pressed={value === type} onClick={() => onChange(type)}>
        {type === 'team' ? 'Team' : 'Individual'}
      </Button>
    ))}
  </Button.Group>
}

export interface NominationFilterValues {
  category: string
  search: string
  department: string
}

interface NominationFiltersProps {
  filters: NominationFilterValues
  onChange: (filters: NominationFilterValues) => void
  nominations: readonly { category: string }[]
  departments: string[]
}

export function NominationFilters({ filters, onChange, nominations, departments }: NominationFiltersProps) {
  return <>
    <div className="dp-category-tabs" role="group" aria-label="Filter by award category">
      <UnstyledButton className="dp-category-tab" data-active={filters.category === ''} aria-pressed={filters.category === ''}
        onClick={() => onChange({ ...filters, category: '' })}>
        <span>All nominees</span>
        <span className="dp-category-tab__count">{nominations.length}</span>
      </UnstyledButton>
      {DIGITAL_PIONEER_TRACKS.map((track) => (
        <UnstyledButton key={track.value} className="dp-category-tab" data-active={filters.category === track.value}
          aria-pressed={filters.category === track.value} onClick={() => onChange({ ...filters, category: track.value })}>
          <span>{track.label}</span>
          <span className="dp-category-tab__count">{nominations.filter((nomination) => nomination.category === track.value).length}</span>
        </UnstyledButton>
      ))}
    </div>
    <Card className="dp-filter-shell" p="sm">
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
        <TextInput placeholder="Search nominees" aria-label="Search nominees" leftSection={<IconSearch size={16} />}
          value={filters.search} onChange={(event) => onChange({ ...filters, search: event.currentTarget.value })} />
        <Select placeholder="Filter by department" aria-label="Filter by department" data={departments}
          value={filters.department || null} onChange={(value) => onChange({ ...filters, department: value ?? '' })}
          searchable clearable />
      </SimpleGrid>
    </Card>
  </>
}
