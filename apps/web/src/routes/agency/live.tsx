import { createFileRoute, redirect } from '@tanstack/react-router';

/** Live workforce merged into Roster — keep route for old links */
export const Route = createFileRoute('/agency/live')({
  beforeLoad: () => {
    throw redirect({ to: '/agency/roster' });
  },
});
