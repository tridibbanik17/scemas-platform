import { writeFile } from 'node:fs/promises'

const FEATURE_SERVICE_URL =
  'https://services.arcgis.com/rYz782eMbySr2srL/arcgis/rest/services/Neighborhoods/FeatureServer/8/query'
const SOURCE_URL =
  'https://services.arcgis.com/rYz782eMbySr2srL/arcgis/rest/services/Neighborhoods/FeatureServer/8'

type MetricType = 'temperature' | 'humidity' | 'air_quality' | 'noise_level'
type StationProfile =
  | 'civic_streetscape'
  | 'rooftop'
  | 'transit_hub'
  | 'shoreline'
  | 'park_edge'
  | 'trailhead'
  | 'campus'
  | 'arterial'
  | 'hospital'
  | 'main_street'
  | 'suburban_gateway'

type Point = { lat: number; lng: number }
type Ring = number[][]
type PolygonCoordinates = Ring[]
type MultiPolygonCoordinates = PolygonCoordinates[]

type GeoJsonPolygon = { type: 'Polygon'; coordinates: PolygonCoordinates }
type GeoJsonMultiPolygon = { type: 'MultiPolygon'; coordinates: MultiPolygonCoordinates }
type GeoJsonGeometry = GeoJsonPolygon | GeoJsonMultiPolygon

type PlanningUnitFeature = {
  type: 'Feature'
  geometry: GeoJsonGeometry
  properties: { COMMUNITY: string; NEIGHBOURHOOD: string; PLANNING_UNIT: string }
}

type PlanningUnitCollection = { type: 'FeatureCollection'; features: PlanningUnitFeature[] }

type MonitoringRegionFeature = {
  type: 'Feature'
  properties: {
    zoneId: string
    label: string
    community: string
    focusArea: string
    neighbourhoods: string[]
    planningUnits: string[]
    planningUnitDetails: Array<{ id: string; label: string }>
    legacyIds: string[]
    wardIds: string[]
    wardLabels: string[]
    sourceType: 'planning_unit'
    sourceUrl: string
  }
  geometry: GeoJsonMultiPolygon
}

type MonitoringRegionCollection = { type: 'FeatureCollection'; features: MonitoringRegionFeature[] }

type SensorSimulationProfile = {
  mean: number
  variance: number
  spike: number
  min: number
  max: number
}

type SensorCatalogEntry = {
  sensor_id: string
  asset_id: string
  station_id: string
  display_name: string
  device_type: MetricType
  zone: string
  region_label: string
  site_name: string
  site_profile: StationProfile
  provider: string
  ward_id: string
  ward_label: string
  host_planning_unit_id: string
  host_planning_unit_label: string
  community: string
  focus_area: string
  placement: string
  sampling_interval_seconds: number
  telemetry_unit: string
  install_height_m: number
  lat: number
  lng: number
  simulation: SensorSimulationProfile
}

type RegionMetricAdjustments = Partial<
  Record<MetricType, { mean?: number; variance?: number; spike?: number }>
>

type StationBlueprint = {
  stationId: string
  sequence: number
  planningUnit: string
  wardId: string
  wardLabel: string
  siteName: string
  displayStem: string
  provider: string
  profile: StationProfile
  anchor: { x: number; y: number }
}

type MonitoringRegionDefinition = {
  zoneId: string
  code: string
  label: string
  focusArea: string
  legacyIds: string[]
  compatibilityAliases?: string[]
  wardIds: string[]
  wardLabels: string[]
  planningUnits: string[]
  metricAdjustments: RegionMetricAdjustments
  stations: StationBlueprint[]
}

type CoreRegionCatalog = {
  regions: Array<{ id: string; label: string; sensorCode: string }>
  directAliases: Record<string, string>
  groupAliases: Record<string, string[]>
}

type MetricDefinition = {
  prefix: string
  assetCode: string
  deviceType: MetricType
  labelSuffix: string
  telemetryUnit: string
  placementByProfile: Record<StationProfile, string>
  installHeightByProfile: Record<StationProfile, number>
  samplingIntervalByProfile: Record<StationProfile, number>
  baseSimulation: SensorSimulationProfile
  profileAdjustments: Partial<
    Record<StationProfile, { mean?: number; variance?: number; spike?: number }>
  >
  jitter: { lat: number; lng: number }
}

const regionDefinitions: MonitoringRegionDefinition[] = [
  {
    zoneId: 'downtown_core',
    code: 'dt',
    label: 'downtown core',
    focusArea: 'civic core',
    legacyIds: ['downtown'],
    wardIds: ['ward_2'],
    wardLabels: ['ward 2'],
    planningUnits: ['6701', '6702', '6703', '6704'],
    metricAdjustments: {
      temperature: { mean: 2, variance: 2, spike: 3 },
      humidity: { mean: -2 },
      air_quality: { mean: 9, variance: 16, spike: 28 },
      noise_level: { mean: 8, variance: 5, spike: 8 },
    },
    stations: [
      {
        stationId: 'dt-civic-square',
        sequence: 1,
        planningUnit: '6704',
        wardId: 'ward_2',
        wardLabel: 'ward 2',
        siteName: 'king william st & james st n',
        displayStem: 'king william streetscape',
        provider: 'city of hamilton transportation operations',
        profile: 'civic_streetscape',
        anchor: { x: 0.48, y: 0.47 },
      },
      {
        stationId: 'dt-jackson-square',
        sequence: 2,
        planningUnit: '6701',
        wardId: 'ward_2',
        wardLabel: 'ward 2',
        siteName: 'jackson square roofline',
        displayStem: 'jackson square roof',
        provider: 'downtown civic data pilot',
        profile: 'rooftop',
        anchor: { x: 0.56, y: 0.38 },
      },
      {
        stationId: 'dt-go-centre',
        sequence: 3,
        planningUnit: '6702',
        wardId: 'ward_2',
        wardLabel: 'ward 2',
        siteName: 'hamilton go centre',
        displayStem: 'go centre transit',
        provider: 'hamilton transit operations',
        profile: 'transit_hub',
        anchor: { x: 0.54, y: 0.58 },
      },
    ],
  },
  {
    zoneId: 'north_end_west',
    code: 'wf',
    label: 'west harbour',
    focusArea: 'harbour shoreline',
    legacyIds: ['waterfront', 'west_harbour'],
    wardIds: ['ward_1', 'ward_2'],
    wardLabels: ['ward 1', 'ward 2'],
    planningUnits: ['6101', '6102', '6804'],
    metricAdjustments: {
      temperature: { mean: -1, variance: -1 },
      humidity: { mean: 8, variance: -4 },
      air_quality: { mean: 1, variance: -8, spike: -8 },
      noise_level: { mean: -2, variance: -3, spike: -3 },
    },
    stations: [
      {
        stationId: 'wf-pier-8',
        sequence: 1,
        planningUnit: '6102',
        wardId: 'ward_2',
        wardLabel: 'ward 2',
        siteName: 'pier 8 promenade',
        displayStem: 'pier 8 promenade',
        provider: 'hamilton harbour observatory',
        profile: 'shoreline',
        anchor: { x: 0.72, y: 0.64 },
      },
      {
        stationId: 'wf-bayfront',
        sequence: 2,
        planningUnit: '6804',
        wardId: 'ward_1',
        wardLabel: 'ward 1',
        siteName: 'bayfront park shoreline',
        displayStem: 'bayfront shoreline',
        provider: 'hamilton harbour observatory',
        profile: 'shoreline',
        anchor: { x: 0.42, y: 0.58 },
      },
      {
        stationId: 'wf-dundurn-castle',
        sequence: 3,
        planningUnit: '6101',
        wardId: 'ward_1',
        wardLabel: 'ward 1',
        siteName: 'dundurn castle park edge',
        displayStem: 'dundurn park edge',
        provider: 'hamilton parks climate pilot',
        profile: 'park_edge',
        anchor: { x: 0.46, y: 0.42 },
      },
    ],
  },
  {
    zoneId: 'kirkendall_chedoke',
    code: 'kd',
    label: 'kirkendall / chedoke',
    focusArea: 'locke street and escarpment edge',
    legacyIds: ['kirkendall', 'kirkendall_north', 'kirkendall_south'],
    wardIds: ['ward_1'],
    wardLabels: ['ward 1'],
    planningUnits: ['6801', '6802', '6803'],
    metricAdjustments: {
      temperature: { mean: 0.2, variance: -0.5 },
      humidity: { mean: 2, variance: -1 },
      air_quality: { mean: -1, variance: -3, spike: -4 },
      noise_level: { mean: 2, variance: 1, spike: 2 },
    },
    stations: [
      {
        stationId: 'kd-locke-charlton',
        sequence: 1,
        planningUnit: '6803',
        wardId: 'ward_1',
        wardLabel: 'ward 1',
        siteName: 'locke st s & charlton ave w',
        displayStem: 'locke street north',
        provider: 'hamilton west-end mobility pilot',
        profile: 'main_street',
        anchor: { x: 0.54, y: 0.52 },
      },
      {
        stationId: 'kd-aberdeen-corridor',
        sequence: 2,
        planningUnit: '6802',
        wardId: 'ward_1',
        wardLabel: 'ward 1',
        siteName: 'aberdeen ave & locke st s',
        displayStem: 'aberdeen corridor',
        provider: 'hamilton west-end mobility pilot',
        profile: 'main_street',
        anchor: { x: 0.56, y: 0.44 },
      },
      {
        stationId: 'kd-chedoke-radial',
        sequence: 3,
        planningUnit: '6801',
        wardId: 'ward_1',
        wardLabel: 'ward 1',
        siteName: 'chedoke radial trail edge',
        displayStem: 'chedoke trail edge',
        provider: 'hamilton escarpment watch',
        profile: 'trailhead',
        anchor: { x: 0.42, y: 0.52 },
      },
    ],
  },
  {
    zoneId: 'crown_point_west',
    code: 'ee',
    label: 'crown point west',
    focusArea: 'east-end corridor',
    legacyIds: ['east_end'],
    wardIds: ['ward_3'],
    wardLabels: ['ward 3'],
    planningUnits: ['6605', '6606', '6607', '6608'],
    metricAdjustments: {
      temperature: { mean: 1, variance: 1 },
      humidity: { mean: 1 },
      air_quality: { mean: 7, variance: 12, spike: 20 },
      noise_level: { mean: 7, variance: 4, spike: 7 },
    },
    stations: [
      {
        stationId: 'ee-ottawa-kenilworth',
        sequence: 1,
        planningUnit: '6605',
        wardId: 'ward_3',
        wardLabel: 'ward 3',
        siteName: 'ottawa st n & kenilworth ave n',
        displayStem: 'ottawa industrial-edge',
        provider: 'city of hamilton industrial corridor pilot',
        profile: 'arterial',
        anchor: { x: 0.58, y: 0.46 },
      },
      {
        stationId: 'ee-gage-barton',
        sequence: 2,
        planningUnit: '6606',
        wardId: 'ward_3',
        wardLabel: 'ward 3',
        siteName: 'gage park perimeter',
        displayStem: 'gage park perimeter',
        provider: 'hamilton neighbourhood air pilot',
        profile: 'park_edge',
        anchor: { x: 0.48, y: 0.52 },
      },
      {
        stationId: 'ee-tim-hortons-field',
        sequence: 3,
        planningUnit: '6607',
        wardId: 'ward_3',
        wardLabel: 'ward 3',
        siteName: 'tim hortons field precinct',
        displayStem: 'stadium precinct',
        provider: 'hamilton stadium district pilot',
        profile: 'main_street',
        anchor: { x: 0.42, y: 0.64 },
      },
    ],
  },
  {
    zoneId: 'red_hill_valley',
    code: 'rh',
    label: 'red hill valley',
    focusArea: 'parkway corridor',
    legacyIds: ['red_hill'],
    wardIds: ['ward_5'],
    wardLabels: ['ward 5'],
    planningUnits: ['6401', '6402', '6405'],
    metricAdjustments: {
      temperature: { mean: 0.5 },
      humidity: { mean: 2 },
      air_quality: { mean: 5, variance: 9, spike: 14 },
      noise_level: { mean: 4, variance: 2, spike: 5 },
    },
    stations: [
      {
        stationId: 'rh-trail-north',
        sequence: 1,
        planningUnit: '6401',
        wardId: 'ward_5',
        wardLabel: 'ward 5',
        siteName: 'red hill valley trail north',
        displayStem: 'red hill trail',
        provider: 'red hill corridor observatory',
        profile: 'park_edge',
        anchor: { x: 0.44, y: 0.3 },
      },
      {
        stationId: 'rh-queenston-corridor',
        sequence: 2,
        planningUnit: '6402',
        wardId: 'ward_5',
        wardLabel: 'ward 5',
        siteName: 'queenston rd & red hill valley pkwy',
        displayStem: 'queenston corridor',
        provider: 'red hill corridor observatory',
        profile: 'arterial',
        anchor: { x: 0.42, y: 0.58 },
      },
      {
        stationId: 'rh-eastgate-edge',
        sequence: 3,
        planningUnit: '6405',
        wardId: 'ward_5',
        wardLabel: 'ward 5',
        siteName: 'eastgate edge corridor',
        displayStem: 'eastgate edge',
        provider: 'east hamilton transport analytics',
        profile: 'suburban_gateway',
        anchor: { x: 0.62, y: 0.62 },
      },
    ],
  },
  {
    zoneId: 'east_mountain',
    code: 'em',
    label: 'east mountain',
    focusArea: 'escarpment plateau',
    legacyIds: [],
    wardIds: ['ward_7'],
    wardLabels: ['ward 7'],
    planningUnits: ['7208', '7209', '7210', '7211'],
    metricAdjustments: {
      temperature: { mean: 0.8 },
      humidity: { mean: 1 },
      air_quality: { mean: 2, variance: 4, spike: 8 },
      noise_level: { mean: 2, variance: 1, spike: 3 },
    },
    stations: [
      {
        stationId: 'em-juravinski-campus',
        sequence: 1,
        planningUnit: '7209',
        wardId: 'ward_7',
        wardLabel: 'ward 7',
        siteName: 'juravinski hospital campus',
        displayStem: 'juravinski campus',
        provider: 'hamilton health climate pilot',
        profile: 'hospital',
        anchor: { x: 0.46, y: 0.55 },
      },
      {
        stationId: 'em-concession-corridor',
        sequence: 2,
        planningUnit: '7208',
        wardId: 'ward_7',
        wardLabel: 'ward 7',
        siteName: 'concession st & upper wentworth st',
        displayStem: 'concession corridor',
        provider: 'hamilton health climate pilot',
        profile: 'main_street',
        anchor: { x: 0.52, y: 0.42 },
      },
      {
        stationId: 'em-mountain-brow',
        sequence: 3,
        planningUnit: '7211',
        wardId: 'ward_7',
        wardLabel: 'ward 7',
        siteName: 'mountain brow east lookout',
        displayStem: 'mountain brow',
        provider: 'hamilton escarpment watch',
        profile: 'park_edge',
        anchor: { x: 0.56, y: 0.38 },
      },
    ],
  },
  {
    zoneId: 'west_mountain',
    code: 'wm',
    label: 'west mountain',
    focusArea: 'mountain mobility',
    legacyIds: [],
    compatibilityAliases: ['ward_14'],
    wardIds: ['ward_8'],
    wardLabels: ['ward 8'],
    planningUnits: ['7107', '7108', '7109'],
    metricAdjustments: {
      temperature: { mean: 1.2 },
      humidity: { mean: 1 },
      air_quality: { mean: 3, variance: 6, spike: 10 },
      noise_level: { mean: 4, variance: 2, spike: 4 },
    },
    stations: [
      {
        stationId: 'wm-arterial-corridor',
        sequence: 1,
        planningUnit: '7108',
        wardId: 'ward_8',
        wardLabel: 'ward 8',
        siteName: 'upper james st & mohawk rd w',
        displayStem: 'upper james arterial',
        provider: 'city of hamilton mobility analytics',
        profile: 'arterial',
        anchor: { x: 0.46, y: 0.58 },
      },
      {
        stationId: 'wm-westmount-recreation',
        sequence: 2,
        planningUnit: '7109',
        wardId: 'ward_8',
        wardLabel: 'ward 8',
        siteName: 'westmount recreation centre',
        displayStem: 'westmount recreation',
        provider: 'hamilton recreation air pilot',
        profile: 'park_edge',
        anchor: { x: 0.52, y: 0.46 },
      },
      {
        stationId: 'wm-mohawk-sports',
        sequence: 3,
        planningUnit: '7107',
        wardId: 'ward_8',
        wardLabel: 'ward 8',
        siteName: 'mohawk sports complex',
        displayStem: 'mohawk sports complex',
        provider: 'hamilton campus recreation air pilot',
        profile: 'campus',
        anchor: { x: 0.48, y: 0.36 },
      },
    ],
  },
  {
    zoneId: 'cootes_paradise',
    code: 'mc',
    label: 'cootes paradise / westdale',
    focusArea: 'campus ecology',
    legacyIds: ['mcmaster'],
    wardIds: ['ward_1'],
    wardLabels: ['ward 1'],
    planningUnits: ['6901', '6905', '6906'],
    metricAdjustments: {
      temperature: { mean: -1, variance: -2, spike: -1 },
      humidity: { mean: 8, variance: -6 },
      air_quality: { mean: -6, variance: -10, spike: -15 },
      noise_level: { mean: -8, variance: -6, spike: -8 },
    },
    stations: [
      {
        stationId: 'mc-princess-point',
        sequence: 1,
        planningUnit: '6906',
        wardId: 'ward_1',
        wardLabel: 'ward 1',
        siteName: 'princess point trailhead',
        displayStem: 'princess point canopy',
        provider: 'cootes ecology field network',
        profile: 'trailhead',
        anchor: { x: 0.44, y: 0.44 },
      },
      {
        stationId: 'mc-campus-west',
        sequence: 2,
        planningUnit: '6901',
        wardId: 'ward_1',
        wardLabel: 'ward 1',
        siteName: 'mcmaster west campus',
        displayStem: 'mcmaster west campus',
        provider: 'mcmaster facilities air pilot',
        profile: 'campus',
        anchor: { x: 0.46, y: 0.52 },
      },
      {
        stationId: 'mc-westdale-village',
        sequence: 3,
        planningUnit: '6905',
        wardId: 'ward_1',
        wardLabel: 'ward 1',
        siteName: 'westdale village',
        displayStem: 'westdale village',
        provider: 'westdale main street partnership',
        profile: 'main_street',
        anchor: { x: 0.54, y: 0.52 },
      },
    ],
  },
  {
    zoneId: 'dundas_central',
    code: 'du',
    label: 'dundas central',
    focusArea: 'historic main street',
    legacyIds: ['dundas'],
    wardIds: ['ward_13'],
    wardLabels: ['ward 13'],
    planningUnits: ['2206', '2220', '2221'],
    metricAdjustments: {
      temperature: { mean: -0.4 },
      humidity: { mean: 4 },
      air_quality: { mean: -2, variance: -4, spike: -6 },
      noise_level: { mean: 0, variance: -1, spike: -1 },
    },
    stations: [
      {
        stationId: 'du-king-osler',
        sequence: 1,
        planningUnit: '2206',
        wardId: 'ward_13',
        wardLabel: 'ward 13',
        siteName: 'king st w & osler dr',
        displayStem: 'dundas main street',
        provider: 'dundas mobility climate pilot',
        profile: 'main_street',
        anchor: { x: 0.46, y: 0.54 },
      },
      {
        stationId: 'du-driving-park',
        sequence: 2,
        planningUnit: '2220',
        wardId: 'ward_13',
        wardLabel: 'ward 13',
        siteName: 'dundas driving park',
        displayStem: 'driving park edge',
        provider: 'dundas valley environmental network',
        profile: 'park_edge',
        anchor: { x: 0.44, y: 0.46 },
      },
      {
        stationId: 'du-town-hall',
        sequence: 3,
        planningUnit: '2221',
        wardId: 'ward_13',
        wardLabel: 'ward 13',
        siteName: 'dundas town hall precinct',
        displayStem: 'town hall precinct',
        provider: 'dundas civic data pilot',
        profile: 'civic_streetscape',
        anchor: { x: 0.5, y: 0.42 },
      },
    ],
  },
  {
    zoneId: 'ancaster_gateway',
    code: 'an',
    label: 'ancaster gateway',
    focusArea: 'gateway arterial',
    legacyIds: ['ancaster'],
    wardIds: ['ward_12'],
    wardLabels: ['ward 12'],
    planningUnits: ['3103', '3111', '3114'],
    metricAdjustments: {
      temperature: { mean: 0.7 },
      humidity: { mean: 1 },
      air_quality: { mean: 0, variance: -2, spike: -2 },
      noise_level: { mean: 2, variance: 1, spike: 2 },
    },
    stations: [
      {
        stationId: 'an-meadowlands',
        sequence: 1,
        planningUnit: '3103',
        wardId: 'ward_12',
        wardLabel: 'ward 12',
        siteName: 'meadowlands power centre',
        displayStem: 'meadowlands gateway',
        provider: 'ancaster gateway mobility network',
        profile: 'suburban_gateway',
        anchor: { x: 0.56, y: 0.62 },
      },
      {
        stationId: 'an-arts-centre',
        sequence: 2,
        planningUnit: '3111',
        wardId: 'ward_12',
        wardLabel: 'ward 12',
        siteName: 'ancaster memorial arts centre',
        displayStem: 'memorial arts centre',
        provider: 'ancaster civic climate pilot',
        profile: 'civic_streetscape',
        anchor: { x: 0.46, y: 0.42 },
      },
      {
        stationId: 'an-fiddlers-green',
        sequence: 3,
        planningUnit: '3114',
        wardId: 'ward_12',
        wardLabel: 'ward 12',
        siteName: "fiddler's green & wilson",
        displayStem: "fiddler's green",
        provider: 'ancaster heritage corridor pilot',
        profile: 'main_street',
        anchor: { x: 0.44, y: 0.52 },
      },
    ],
  },
  {
    zoneId: 'battlefield',
    code: 'sc',
    label: 'battlefield village',
    focusArea: 'heritage main street',
    legacyIds: ['stoney_creek'],
    wardIds: ['ward_5'],
    wardLabels: ['ward 5'],
    planningUnits: ['5105', '5106', '5114'],
    metricAdjustments: {
      temperature: { mean: 0.4 },
      humidity: { mean: 2 },
      air_quality: { mean: 2, variance: 0, spike: 2 },
      noise_level: { mean: 3, variance: 1, spike: 2 },
    },
    stations: [
      {
        stationId: 'sc-king-centennial',
        sequence: 1,
        planningUnit: '5106',
        wardId: 'ward_5',
        wardLabel: 'ward 5',
        siteName: 'king st e & centennial pkwy n',
        displayStem: 'king & centennial',
        provider: 'stoney creek mobility network',
        profile: 'arterial',
        anchor: { x: 0.56, y: 0.56 },
      },
      {
        stationId: 'sc-battlefield-house',
        sequence: 2,
        planningUnit: '5105',
        wardId: 'ward_5',
        wardLabel: 'ward 5',
        siteName: 'battlefield house museum grounds',
        displayStem: 'battlefield house grounds',
        provider: 'battlefield house grounds pilot',
        profile: 'park_edge',
        anchor: { x: 0.46, y: 0.52 },
      },
      {
        stationId: 'sc-lake-ave',
        sequence: 3,
        planningUnit: '5114',
        wardId: 'ward_5',
        wardLabel: 'ward 5',
        siteName: 'lake ave s main street',
        displayStem: 'lake avenue village',
        provider: 'stoney creek heritage corridor pilot',
        profile: 'main_street',
        anchor: { x: 0.58, y: 0.44 },
      },
    ],
  },
]

const stationProfileMetadata: Record<
  StationProfile,
  {
    sampling: { climate: number; chemistry: number; acoustics: number }
    placement: Record<MetricType, string>
    installHeight: Record<MetricType, number>
  }
> = {
  civic_streetscape: {
    sampling: { climate: 60, chemistry: 30, acoustics: 15 },
    placement: {
      temperature: 'streetscape weather mast',
      humidity: 'streetscape weather mast',
      air_quality: 'air-quality cabinet',
      noise_level: 'signal-arm microphone',
    },
    installHeight: { temperature: 4.8, humidity: 4.8, air_quality: 4.6, noise_level: 6.2 },
  },
  rooftop: {
    sampling: { climate: 60, chemistry: 30, acoustics: 20 },
    placement: {
      temperature: 'roof weather pole',
      humidity: 'roof weather pole',
      air_quality: 'roof intake canister',
      noise_level: 'roof parapet microphone',
    },
    installHeight: { temperature: 21, humidity: 21, air_quality: 21.5, noise_level: 22 },
  },
  transit_hub: {
    sampling: { climate: 60, chemistry: 30, acoustics: 20 },
    placement: {
      temperature: 'transit canopy mast',
      humidity: 'transit canopy mast',
      air_quality: 'platform intake cabinet',
      noise_level: 'platform-edge microphone',
    },
    installHeight: { temperature: 5.6, humidity: 5.6, air_quality: 4.8, noise_level: 6.4 },
  },
  shoreline: {
    sampling: { climate: 90, chemistry: 45, acoustics: 30 },
    placement: {
      temperature: 'shoreline weather pole',
      humidity: 'shoreline weather pole',
      air_quality: 'harbour inlet canister',
      noise_level: 'boardwalk microphone',
    },
    installHeight: { temperature: 4.7, humidity: 4.7, air_quality: 4.2, noise_level: 4.1 },
  },
  park_edge: {
    sampling: { climate: 90, chemistry: 45, acoustics: 30 },
    placement: {
      temperature: 'park-edge weather pole',
      humidity: 'park-edge weather pole',
      air_quality: 'park inlet canister',
      noise_level: 'park-edge microphone',
    },
    installHeight: { temperature: 4.5, humidity: 4.5, air_quality: 4.1, noise_level: 4.2 },
  },
  trailhead: {
    sampling: { climate: 90, chemistry: 45, acoustics: 30 },
    placement: {
      temperature: 'trail weather pole',
      humidity: 'trail weather pole',
      air_quality: 'trail inlet canister',
      noise_level: 'trail-edge microphone',
    },
    installHeight: { temperature: 4, humidity: 4, air_quality: 3.7, noise_level: 3.5 },
  },
  campus: {
    sampling: { climate: 60, chemistry: 30, acoustics: 20 },
    placement: {
      temperature: 'campus weather pole',
      humidity: 'campus weather pole',
      air_quality: 'campus intake canister',
      noise_level: 'campus-edge microphone',
    },
    installHeight: { temperature: 12.5, humidity: 12.5, air_quality: 12.9, noise_level: 5.2 },
  },
  arterial: {
    sampling: { climate: 60, chemistry: 30, acoustics: 20 },
    placement: {
      temperature: 'roadside weather pole',
      humidity: 'roadside weather pole',
      air_quality: 'corridor air-quality cabinet',
      noise_level: 'traffic mast microphone',
    },
    installHeight: { temperature: 5.3, humidity: 5.3, air_quality: 4.3, noise_level: 6 },
  },
  hospital: {
    sampling: { climate: 60, chemistry: 30, acoustics: 20 },
    placement: {
      temperature: 'hospital weather mast',
      humidity: 'hospital weather mast',
      air_quality: 'clinical rooftop intake',
      noise_level: 'campus perimeter microphone',
    },
    installHeight: { temperature: 8.5, humidity: 8.5, air_quality: 9.2, noise_level: 5.5 },
  },
  main_street: {
    sampling: { climate: 75, chemistry: 45, acoustics: 25 },
    placement: {
      temperature: 'main-street weather pole',
      humidity: 'main-street weather pole',
      air_quality: 'main-street intake canister',
      noise_level: 'storefront microphone',
    },
    installHeight: { temperature: 4.9, humidity: 4.9, air_quality: 4.2, noise_level: 4.6 },
  },
  suburban_gateway: {
    sampling: { climate: 75, chemistry: 45, acoustics: 25 },
    placement: {
      temperature: 'gateway weather pole',
      humidity: 'gateway weather pole',
      air_quality: 'gateway intake cabinet',
      noise_level: 'parking-lot microphone',
    },
    installHeight: { temperature: 5.2, humidity: 5.2, air_quality: 4.4, noise_level: 5 },
  },
}

const metricDefinitions: MetricDefinition[] = [
  {
    prefix: 'temp',
    assetCode: 'TEMP',
    deviceType: 'temperature',
    labelSuffix: 'temperature',
    telemetryUnit: 'c',
    placementByProfile: mapByMetric('temperature'),
    installHeightByProfile: mapByHeight('temperature'),
    samplingIntervalByProfile: mapBySampling('climate'),
    baseSimulation: { mean: 22, variance: 10, spike: 38, min: -10, max: 45 },
    profileAdjustments: {
      rooftop: { mean: 1.4, variance: 1.5, spike: 2 },
      shoreline: { mean: -1.2, variance: -1 },
      park_edge: { mean: -0.8, variance: -1 },
      trailhead: { mean: -1.2, variance: -2 },
      arterial: { mean: 1, variance: 1 },
      hospital: { mean: 0.6, variance: 0.5 },
      suburban_gateway: { mean: 0.8 },
    },
    jitter: { lat: 0.00016, lng: 0.00006 },
  },
  {
    prefix: 'hum',
    assetCode: 'HUM',
    deviceType: 'humidity',
    labelSuffix: 'humidity',
    telemetryUnit: '%',
    placementByProfile: mapByMetric('humidity'),
    installHeightByProfile: mapByHeight('humidity'),
    samplingIntervalByProfile: mapBySampling('climate'),
    baseSimulation: { mean: 60, variance: 26, spike: 92, min: 0, max: 100 },
    profileAdjustments: {
      shoreline: { mean: 6, variance: -6 },
      park_edge: { mean: 3, variance: -3 },
      trailhead: { mean: 5, variance: -6 },
      rooftop: { mean: -2, variance: 3 },
      arterial: { mean: -1, variance: 1 },
      campus: { mean: 2 },
    },
    jitter: { lat: -0.00014, lng: 0.00014 },
  },
  {
    prefix: 'aqi',
    assetCode: 'AQI',
    deviceType: 'air_quality',
    labelSuffix: 'pm2.5',
    telemetryUnit: 'ug/m3',
    placementByProfile: mapByMetric('air_quality'),
    installHeightByProfile: mapByHeight('air_quality'),
    samplingIntervalByProfile: mapBySampling('chemistry'),
    baseSimulation: { mean: 18, variance: 34, spike: 118, min: 0, max: 500 },
    profileAdjustments: {
      arterial: { mean: 6, variance: 18, spike: 22 },
      transit_hub: { mean: 4, variance: 10, spike: 14 },
      shoreline: { mean: -2, variance: -8, spike: -10 },
      park_edge: { mean: -2, variance: -8, spike: -10 },
      trailhead: { mean: -4, variance: -10, spike: -18 },
      campus: { mean: -2, variance: -6, spike: -8 },
      suburban_gateway: { mean: 2, variance: 4, spike: 6 },
    },
    jitter: { lat: 0.00008, lng: -0.00016 },
  },
  {
    prefix: 'noise',
    assetCode: 'NOI',
    deviceType: 'noise_level',
    labelSuffix: 'noise',
    telemetryUnit: 'db',
    placementByProfile: mapByMetric('noise_level'),
    installHeightByProfile: mapByHeight('noise_level'),
    samplingIntervalByProfile: mapBySampling('acoustics'),
    baseSimulation: { mean: 57, variance: 16, spike: 84, min: 0, max: 130 },
    profileAdjustments: {
      arterial: { mean: 7, variance: 4, spike: 7 },
      transit_hub: { mean: 5, variance: 3, spike: 6 },
      shoreline: { mean: -2, variance: -2, spike: -2 },
      park_edge: { mean: -3, variance: -4, spike: -5 },
      trailhead: { mean: -6, variance: -6, spike: -8 },
      campus: { mean: -4, variance: -4, spike: -4 },
      hospital: { mean: -2, variance: -2, spike: -2 },
      suburban_gateway: { mean: 2, variance: 1, spike: 2 },
    },
    jitter: { lat: -0.00012, lng: -0.00012 },
  },
]

await main()

async function main() {
  const planningUnitIds = Array.from(
    new Set(regionDefinitions.flatMap(region => region.planningUnits)),
  ).toSorted((left, right) => left.localeCompare(right))
  const planningUnitCollection = await fetchPlanningUnits(planningUnitIds)
  const featureByPlanningUnit = new Map(
    planningUnitCollection.features.map(feature => [feature.properties.PLANNING_UNIT, feature]),
  )

  const regionCollection: MonitoringRegionCollection = {
    type: 'FeatureCollection',
    features: regionDefinitions.map(region => buildRegionFeature(region, featureByPlanningUnit)),
  }

  const sensors = regionDefinitions.flatMap(region =>
    buildRegionSensors(region, featureByPlanningUnit),
  )
  const coreRegionCatalog = buildCoreRegionCatalog(regionDefinitions)

  await writeFile(
    'data/hamilton-monitoring-regions.json',
    `${JSON.stringify(regionCollection, null, 2)}\n`,
  )
  await writeFile('data/hamilton-sensor-catalog.json', `${JSON.stringify(sensors, null, 2)}\n`)
  await writeFile(
    'crates/scemas-core/src/regions.catalog.json',
    `${JSON.stringify(coreRegionCatalog, null, 2)}\n`,
  )

  const stationCount = new Set(sensors.map(sensor => sensor.station_id)).size
  const wardCount = new Set(sensors.map(sensor => sensor.ward_id)).size

  console.log(
    `generated ${regionCollection.features.length} regions, ${stationCount} stations, ${sensors.length} sensors across ${wardCount} wards`,
  )
}

function buildCoreRegionCatalog(regions: MonitoringRegionDefinition[]): CoreRegionCatalog {
  const directAliases = new Map<string, string>()
  const groupedAliases = new Map<string, Set<string>>()

  for (const region of regions) {
    for (const legacyId of region.legacyIds) {
      setAlias(directAliases, legacyId, region.zoneId)
    }

    for (const compatibilityAlias of region.compatibilityAliases ?? []) {
      setAlias(directAliases, compatibilityAlias, region.zoneId)
    }

    for (const wardId of region.wardIds) {
      const zoneIds = groupedAliases.get(wardId) ?? new Set<string>()
      zoneIds.add(region.zoneId)
      groupedAliases.set(wardId, zoneIds)
    }
  }

  const finalizedGroupAliases = new Map<string, string[]>()

  for (const [wardId, regionIds] of groupedAliases) {
    const canonicalIds = Array.from(regionIds).toSorted((left, right) => left.localeCompare(right))
    if (canonicalIds.length === 1) {
      setAlias(directAliases, wardId, canonicalIds[0])
      continue
    }

    finalizedGroupAliases.set(wardId, canonicalIds)
  }

  return {
    regions: regions
      .map(region => ({ id: region.zoneId, label: region.label, sensorCode: region.code }))
      .toSorted((left, right) => left.id.localeCompare(right.id)),
    directAliases: Object.fromEntries(
      Array.from(directAliases.entries()).toSorted(([left], [right]) => left.localeCompare(right)),
    ),
    groupAliases: Object.fromEntries(
      Array.from(finalizedGroupAliases.entries()).toSorted(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  }
}

function setAlias(aliases: Map<string, string>, alias: string, zoneId: string) {
  const existingZoneId = aliases.get(alias)
  if (existingZoneId && existingZoneId !== zoneId) {
    throw new Error(`alias ${alias} cannot map to both ${existingZoneId} and ${zoneId}`)
  }

  aliases.set(alias, zoneId)
}

function mapByMetric(metric: MetricType): Record<StationProfile, string> {
  return Object.fromEntries(
    Object.entries(stationProfileMetadata).map(([profile, metadata]) => [
      profile,
      metadata.placement[metric],
    ]),
  ) as Record<StationProfile, string>
}

function mapByHeight(metric: MetricType): Record<StationProfile, number> {
  return Object.fromEntries(
    Object.entries(stationProfileMetadata).map(([profile, metadata]) => [
      profile,
      metadata.installHeight[metric],
    ]),
  ) as Record<StationProfile, number>
}

function mapBySampling(key: 'climate' | 'chemistry' | 'acoustics'): Record<StationProfile, number> {
  return Object.fromEntries(
    Object.entries(stationProfileMetadata).map(([profile, metadata]) => [
      profile,
      metadata.sampling[key],
    ]),
  ) as Record<StationProfile, number>
}

async function fetchPlanningUnits(planningUnits: string[]): Promise<PlanningUnitCollection> {
  const clause = planningUnits.map(id => `'${id}'`).join(',')
  const query = new URLSearchParams({
    where: `PLANNING_UNIT IN (${clause})`,
    outFields: 'COMMUNITY,NEIGHBOURHOOD,PLANNING_UNIT',
    outSR: '4326',
    f: 'geojson',
  })

  const response = await fetch(`${FEATURE_SERVICE_URL}?${query.toString()}`)
  if (!response.ok) {
    throw new Error(`failed to fetch planning units: ${response.status} ${response.statusText}`)
  }

  const payload = (await response.json()) as PlanningUnitCollection
  if (!payload.features?.length) {
    throw new Error('planning unit query returned no features')
  }

  return payload
}

function buildRegionFeature(
  region: MonitoringRegionDefinition,
  featureByPlanningUnit: Map<string, PlanningUnitFeature>,
): MonitoringRegionFeature {
  const unitFeatures = region.planningUnits.map(unitId => {
    const feature = featureByPlanningUnit.get(unitId)
    if (!feature) {
      throw new Error(`missing planning unit ${unitId} for region ${region.zoneId}`)
    }

    return feature
  })

  const communities = Array.from(
    new Set(unitFeatures.map(feature => feature.properties.COMMUNITY.trim())),
  )
  if (communities.length !== 1) {
    throw new Error(
      `region ${region.zoneId} spans unexpected communities: ${communities.join(', ')}`,
    )
  }

  return {
    type: 'Feature',
    properties: {
      zoneId: region.zoneId,
      label: region.label,
      community: communities[0],
      focusArea: region.focusArea,
      neighbourhoods: unitFeatures.map(feature =>
        feature.properties.NEIGHBOURHOOD.trim().toLowerCase(),
      ),
      planningUnits: region.planningUnits,
      planningUnitDetails: unitFeatures.map(feature => ({
        id: feature.properties.PLANNING_UNIT,
        label: feature.properties.NEIGHBOURHOOD.trim().toLowerCase(),
      })),
      legacyIds: region.legacyIds,
      wardIds: region.wardIds,
      wardLabels: region.wardLabels,
      sourceType: 'planning_unit',
      sourceUrl: SOURCE_URL,
    },
    geometry: {
      type: 'MultiPolygon',
      coordinates: unitFeatures.flatMap(feature => multiPolygonCoordinates(feature.geometry)),
    },
  }
}

function buildRegionSensors(
  region: MonitoringRegionDefinition,
  featureByPlanningUnit: Map<string, PlanningUnitFeature>,
): SensorCatalogEntry[] {
  const regionFeature = buildRegionFeature(region, featureByPlanningUnit)

  return region.stations.flatMap(station => {
    const hostPlanningUnit = featureByPlanningUnit.get(station.planningUnit)
    if (!hostPlanningUnit) {
      throw new Error(
        `missing planning unit ${station.planningUnit} for station ${station.stationId}`,
      )
    }

    const basePoint = findPointInsideGeometry(hostPlanningUnit.geometry, station.anchor)

    return metricDefinitions.map(metric => {
      const point = withFallbackPoint(
        jitterPoint(basePoint, metric.jitter),
        hostPlanningUnit.geometry,
        basePoint,
      )
      const regionSimulation = region.metricAdjustments[metric.deviceType] ?? {}
      const profileSimulation = metric.profileAdjustments[station.profile] ?? {}
      const simulation = clampSimulation({
        mean:
          metric.baseSimulation.mean + (regionSimulation.mean ?? 0) + (profileSimulation.mean ?? 0),
        variance:
          metric.baseSimulation.variance +
          (regionSimulation.variance ?? 0) +
          (profileSimulation.variance ?? 0),
        spike:
          metric.baseSimulation.spike +
          (regionSimulation.spike ?? 0) +
          (profileSimulation.spike ?? 0),
        min: metric.baseSimulation.min,
        max: metric.baseSimulation.max,
      })

      return {
        sensor_id: `${metric.prefix}-${region.code}-${String(station.sequence).padStart(3, '0')}`,
        asset_id: `SCM-${region.code.toUpperCase()}-${metric.assetCode}-${String(station.sequence).padStart(3, '0')}`,
        station_id: station.stationId,
        display_name: `${station.displayStem} ${metric.labelSuffix}`,
        device_type: metric.deviceType,
        zone: region.zoneId,
        region_label: region.label,
        site_name: station.siteName,
        site_profile: station.profile,
        provider: station.provider,
        ward_id: station.wardId,
        ward_label: station.wardLabel,
        host_planning_unit_id: station.planningUnit,
        host_planning_unit_label: hostPlanningUnit.properties.NEIGHBOURHOOD.trim().toLowerCase(),
        community: hostPlanningUnit.properties.COMMUNITY.trim(),
        focus_area: region.focusArea,
        placement: metric.placementByProfile[station.profile],
        sampling_interval_seconds: metric.samplingIntervalByProfile[station.profile],
        telemetry_unit: metric.telemetryUnit,
        install_height_m: metric.installHeightByProfile[station.profile],
        lat: roundCoordinate(point.lat),
        lng: roundCoordinate(point.lng),
        simulation,
      } satisfies SensorCatalogEntry
    })
  })
}

function multiPolygonCoordinates(geometry: GeoJsonGeometry): MultiPolygonCoordinates {
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates
  }

  return [geometry.coordinates]
}

function findPointInsideGeometry(
  geometry: GeoJsonGeometry,
  anchor: { x: number; y: number },
): Point {
  const bbox = boundingBox(geometry)
  const candidate = {
    lng: interpolate(bbox.minLng, bbox.maxLng, anchor.x),
    lat: interpolate(bbox.minLat, bbox.maxLat, anchor.y),
  }

  if (pointInGeometry(candidate, geometry)) {
    return candidate
  }

  const stepLng = Math.max((bbox.maxLng - bbox.minLng) / 24, 0.00005)
  const stepLat = Math.max((bbox.maxLat - bbox.minLat) / 24, 0.00005)

  for (let radius = 1; radius <= 18; radius += 1) {
    for (let offsetLng = -radius; offsetLng <= radius; offsetLng += 1) {
      for (let offsetLat = -radius; offsetLat <= radius; offsetLat += 1) {
        if (Math.abs(offsetLng) !== radius && Math.abs(offsetLat) !== radius) {
          continue
        }

        const probe = {
          lng: candidate.lng + stepLng * offsetLng,
          lat: candidate.lat + stepLat * offsetLat,
        }

        if (pointInGeometry(probe, geometry)) {
          return probe
        }
      }
    }
  }

  const centroid = geometryCentroid(geometry)
  if (pointInGeometry(centroid, geometry)) {
    return centroid
  }

  throw new Error('failed to find a point inside the requested planning unit geometry')
}

function withFallbackPoint(point: Point, geometry: GeoJsonGeometry, fallback: Point): Point {
  return pointInGeometry(point, geometry) ? point : fallback
}

function jitterPoint(point: Point, jitter: { lat: number; lng: number }): Point {
  return { lat: point.lat + jitter.lat, lng: point.lng + jitter.lng }
}

function pointInGeometry(point: Point, geometry: GeoJsonGeometry): boolean {
  return multiPolygonCoordinates(geometry).some(polygon => pointInPolygon(point, polygon))
}

function pointInPolygon(point: Point, polygon: PolygonCoordinates): boolean {
  const [outerRing, ...holes] = polygon
  if (!pointInRing(point, outerRing)) {
    return false
  }

  return !holes.some(hole => pointInRing(point, hole))
}

function pointInRing(point: Point, ring: Ring): boolean {
  let inside = false
  const x = point.lng
  const y = point.lat

  for (let left = 0, right = ring.length - 1; left < ring.length; right = left, left += 1) {
    const [leftX, leftY] = ring[left]
    const [rightX, rightY] = ring[right]
    const crossesLatitude = leftY > y !== rightY > y
    if (!crossesLatitude) {
      continue
    }

    const intersectionX = ((rightX - leftX) * (y - leftY)) / (rightY - leftY) + leftX
    if (x < intersectionX) {
      inside = !inside
    }
  }

  return inside
}

function boundingBox(geometry: GeoJsonGeometry) {
  let minLat = Number.POSITIVE_INFINITY
  let maxLat = Number.NEGATIVE_INFINITY
  let minLng = Number.POSITIVE_INFINITY
  let maxLng = Number.NEGATIVE_INFINITY

  for (const polygon of multiPolygonCoordinates(geometry)) {
    for (const ring of polygon) {
      for (const [lng, lat] of ring) {
        minLng = Math.min(minLng, lng)
        maxLng = Math.max(maxLng, lng)
        minLat = Math.min(minLat, lat)
        maxLat = Math.max(maxLat, lat)
      }
    }
  }

  return { minLat, maxLat, minLng, maxLng }
}

function geometryCentroid(geometry: GeoJsonGeometry): Point {
  let sumLat = 0
  let sumLng = 0
  let count = 0

  for (const polygon of multiPolygonCoordinates(geometry)) {
    for (const [lng, lat] of polygon[0] ?? []) {
      sumLng += lng
      sumLat += lat
      count += 1
    }
  }

  if (count === 0) {
    throw new Error('geometry centroid failed because geometry had no vertices')
  }

  return { lat: sumLat / count, lng: sumLng / count }
}

function clampSimulation(simulation: SensorSimulationProfile): SensorSimulationProfile {
  return {
    mean: roundMetric(simulation.mean),
    variance: roundMetric(Math.max(2, simulation.variance)),
    spike: roundMetric(Math.max(simulation.mean + 6, simulation.spike)),
    min: simulation.min,
    max: simulation.max,
  }
}

function roundMetric(value: number): number {
  return Math.round(value * 10) / 10
}

function roundCoordinate(value: number): number {
  return Math.round(value * 10000) / 10000
}

function interpolate(start: number, end: number, ratio: number): number {
  return start + (end - start) * ratio
}
