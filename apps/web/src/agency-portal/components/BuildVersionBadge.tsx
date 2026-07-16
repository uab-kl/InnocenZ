import { BUILD_LABEL } from '@agency-portal/lib/build-info';

export function BuildVersionBadge() {
  return (
    <div
      className="iz-build-version"
      title={`Build ${BUILD_LABEL}`}
      aria-label={`Build ${BUILD_LABEL}`}
    >
      {BUILD_LABEL}
    </div>
  );
}
