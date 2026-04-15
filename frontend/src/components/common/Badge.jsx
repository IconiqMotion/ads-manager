import { STATUS_COLORS } from '../../utils/constants';

export default function Badge({ status }) {
  const cls = STATUS_COLORS[status] || STATUS_COLORS.UNKNOWN;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}
