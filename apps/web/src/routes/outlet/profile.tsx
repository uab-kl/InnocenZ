import { createFileRoute, Link } from '@tanstack/react-router';
import { PortalProfile } from '@agency-portal/components/PortalProfile';
import { useOutletProfile } from '@agency-portal/hooks/use-outlet-profile';
import { useStore } from '@agency-portal/lib/store';
import { MapPin, Settings, Store } from 'lucide-react';

export const Route = createFileRoute('/outlet/profile')({
  component: OutletProfile,
});

function OutletProfile() {
  const outletSettings = useStore((s) => s.outletSettings);
  // Real login → overlay the real venue + location; demo store otherwise.
  const profile = useOutletProfile();
  const venue =
    (profile.backed && profile.settings?.venueName) || outletSettings.venueName;
  const location =
    (profile.backed && profile.settings?.location) || outletSettings.location;
  return (
    <>
      <PortalProfile
        subtitle="InnocenZ · Outlet"
        defaultName="Manager"
        rows={[
          { icon: Store, label: 'Venue', value: venue },
          { icon: MapPin, label: 'Location', value: location },
        ]}
      />
      <div className="px-5 pb-6">
        <Link to="/outlet/settings" className="iz-btn iz-btn-soft w-full">
          <Settings className="h-4 w-4" /> Outlet settings
        </Link>
      </div>
    </>
  );
}
