/**
 * Jest stand-in for `react-native-maps`.
 *
 * The real package resolves a native TurboModule (`RNMapsAirModule`) the moment
 * it is required, and Jest has no native binary — so importing it threw
 * "Invariant Violation: ... could not be found" and took the WHOLE mobile suite
 * down at import time, before a single test ran. CheckInScreen requires it
 * eagerly at module scope whenever `Platform.OS !== 'web'`, which is always true
 * under jest-expo, so nothing that transitively imports App could be tested.
 *
 * Only the members CheckInScreen actually reads are stubbed — see its map block:
 * `RNMaps.default`, `.PROVIDER_GOOGLE`, `.Marker`, `.Circle`. Add to this list if
 * the screen starts using more, rather than reaching for the real package.
 */
const React = require('react');
const { View } = require('react-native');

const stub = (testID) => {
  const Stub = (props) => React.createElement(View, { testID, ...props });
  Stub.displayName = testID;
  return Stub;
};

const MapView = stub('mock-map-view');

module.exports = {
  __esModule: true,
  default: MapView,
  MapView,
  Marker: stub('mock-map-marker'),
  Circle: stub('mock-map-circle'),
  Polygon: stub('mock-map-polygon'),
  Polyline: stub('mock-map-polyline'),
  PROVIDER_GOOGLE: 'google',
  PROVIDER_DEFAULT: 'default',
};
