export const STATUS_COLORS = {
  ACTIVE: 'bg-green-100 text-green-800',
  PAUSED: 'bg-yellow-100 text-yellow-800',
  ARCHIVED: 'bg-gray-100 text-gray-600',
  DELETED: 'bg-red-100 text-red-800',
  UNKNOWN: 'bg-gray-100 text-gray-500'
};

export const STATUS_OPTIONS = ['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED'];

export const OBJECTIVE_OPTIONS = [
  'OUTCOME_AWARENESS', 'OUTCOME_ENGAGEMENT', 'OUTCOME_LEADS',
  'OUTCOME_SALES', 'OUTCOME_TRAFFIC', 'OUTCOME_APP_PROMOTION'
];

export const KPI_SORT_OPTIONS = [
  { value: 'spend', label: 'Spend' },
  { value: 'ctr', label: 'CTR' },
  { value: 'cpc', label: 'CPC' },
  { value: 'leads', label: 'Leads' },
  { value: 'roas', label: 'ROAS' }
];
