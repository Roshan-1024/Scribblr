import { IconCrown } from './Icons';

/** Gold badge shown for the admin (unlimited) account. */
export default function AdminBadge() {
  return (
    <span className="admin-badge" title="Admin — unlimited projects and boards">
      <IconCrown size={13} /> Admin
    </span>
  );
}
