pub const REGION_CATALOG_JSON: &str = include_str!("regions.catalog.json");

type RegionEntry = (&'static str, &'static str, &'static str);
type DirectZoneAliasEntry = (&'static str, &'static str);
type GroupedZoneAliasEntry = (&'static str, &'static [&'static str]);

include!(concat!(env!("OUT_DIR"), "/regions_generated.rs"));

pub fn region_label(zone: &str) -> Option<&'static str> {
    REGIONS
        .iter()
        .find_map(|(region_id, label, _sensor_code)| (*region_id == zone).then_some(*label))
}

pub fn normalize_zone_id(zone: &str, sensor_id: Option<&str>) -> String {
    if let Some(sensor_zone) = sensor_id.and_then(canonical_zone_for_sensor) {
        return sensor_zone.to_string();
    }

    if grouped_zone_alias(zone).is_some() {
        return zone.to_string();
    }

    direct_zone_alias(zone).unwrap_or(zone).to_string()
}

pub fn zone_filter_matches(
    filter_zone: &str,
    candidate_zone: &str,
    sensor_id: Option<&str>,
) -> bool {
    let canonical_candidate = normalize_zone_id(candidate_zone, sensor_id);
    canonical_zone_ids_for_input(filter_zone)
        .iter()
        .any(|zone| zone == &canonical_candidate)
}

pub fn zones_filter_match(
    filter_zones: &[String],
    candidate_zone: &str,
    sensor_id: Option<&str>,
) -> bool {
    filter_zones
        .iter()
        .any(|zone| zone_filter_matches(zone, candidate_zone, sensor_id))
}

fn canonical_zone_ids_for_input(zone: &str) -> Vec<String> {
    if let Some(grouped_zones) = grouped_zone_alias(zone) {
        return grouped_zones
            .iter()
            .map(|zone_id| (*zone_id).to_string())
            .collect();
    }

    vec![direct_zone_alias(zone).unwrap_or(zone).to_string()]
}

fn direct_zone_alias(zone: &str) -> Option<&'static str> {
    DIRECT_ZONE_ALIASES
        .iter()
        .find_map(|(alias, canonical_region)| (*alias == zone).then_some(*canonical_region))
}

fn grouped_zone_alias(zone: &str) -> Option<&'static [&'static str]> {
    GROUPED_ZONE_ALIASES
        .iter()
        .find_map(|(alias, grouped_regions)| (*alias == zone).then_some(*grouped_regions))
}

fn canonical_zone_for_sensor(sensor_id: &str) -> Option<&'static str> {
    let mut segments = sensor_id.split('-');
    let _metric_code = segments.next()?;
    let region_code = segments.next()?;

    REGIONS
        .iter()
        .find_map(|(canonical_region, _label, sensor_code)| {
            (*sensor_code == region_code).then_some(*canonical_region)
        })
}

#[cfg(test)]
mod tests {
    use crate::regions::{
        ANCASTER_GATEWAY, BATTLEFIELD, CANONICAL_REGION_IDS, COOTES_PARADISE, CROWN_POINT_WEST,
        DOWNTOWN_CORE, DUNDAS_CENTRAL, EAST_MOUNTAIN, KIRKENDALL_CHEDOKE, NORTH_END_WEST,
        RED_HILL_VALLEY, WEST_MOUNTAIN, normalize_zone_id, region_label, zone_filter_matches,
        zones_filter_match,
    };

    #[test]
    fn normalizes_direct_legacy_aliases() {
        assert_eq!(normalize_zone_id("downtown", None), DOWNTOWN_CORE);
        assert_eq!(normalize_zone_id("ward_3", None), CROWN_POINT_WEST);
        assert_eq!(normalize_zone_id("mcmaster", None), COOTES_PARADISE);
        assert_eq!(normalize_zone_id("kirkendall", None), KIRKENDALL_CHEDOKE);
        assert_eq!(normalize_zone_id("stoney_creek", None), BATTLEFIELD);
        assert_eq!(normalize_zone_id("red_hill", None), RED_HILL_VALLEY);
        assert_eq!(normalize_zone_id("ward_7", None), EAST_MOUNTAIN);
        assert_eq!(normalize_zone_id("dundas", None), DUNDAS_CENTRAL);
        assert_eq!(normalize_zone_id("ward_12", None), ANCASTER_GATEWAY);
    }

    #[test]
    fn resolves_shared_ward_by_sensor_identity() {
        assert_eq!(
            normalize_zone_id("ward_1", Some("temp-mc-001")),
            COOTES_PARADISE
        );
        assert_eq!(
            normalize_zone_id("ward_1", Some("temp-wf-001")),
            NORTH_END_WEST
        );
        assert_eq!(
            normalize_zone_id("ward_2", Some("temp-dt-001")),
            DOWNTOWN_CORE
        );
        assert_eq!(
            normalize_zone_id("ward_2", Some("temp-wf-001")),
            NORTH_END_WEST
        );
        assert_eq!(
            normalize_zone_id("ward_5", Some("temp-sc-001")),
            BATTLEFIELD
        );
        assert_eq!(
            normalize_zone_id("ward_5", Some("temp-rh-001")),
            RED_HILL_VALLEY
        );
    }

    #[test]
    fn grouped_ward_filter_matches_both_regions() {
        assert!(zone_filter_matches(
            "ward_1",
            "cootes_paradise",
            Some("temp-mc-001")
        ));
        assert!(zone_filter_matches(
            "ward_1",
            "north_end_west",
            Some("temp-wf-001")
        ));
        assert!(zone_filter_matches(
            "ward_2",
            "downtown_core",
            Some("temp-dt-001")
        ));
        assert!(zone_filter_matches(
            "ward_2",
            "north_end_west",
            Some("temp-wf-001")
        ));
        assert!(zone_filter_matches(
            "ward_5",
            "battlefield",
            Some("temp-sc-001")
        ));
        assert!(zone_filter_matches(
            "ward_5",
            "red_hill_valley",
            Some("temp-rh-001")
        ));
    }

    #[test]
    fn resolves_extended_sensor_ids_by_region_segment() {
        assert_eq!(
            normalize_zone_id("ward_2", Some("aqi-dt-civic-002")),
            DOWNTOWN_CORE
        );
        assert_eq!(
            normalize_zone_id("waterfront", Some("noise-wf-bayfront-003")),
            NORTH_END_WEST
        );
        assert_eq!(
            normalize_zone_id("kirkendall", Some("noise-kd-locke-001")),
            KIRKENDALL_CHEDOKE
        );
        assert_eq!(
            normalize_zone_id("red_hill", Some("aqi-rh-eastgate-002")),
            RED_HILL_VALLEY
        );
        assert_eq!(
            normalize_zone_id("ward_7", Some("noise-em-brow-003")),
            EAST_MOUNTAIN
        );
        assert_eq!(
            normalize_zone_id("dundas", Some("temp-du-townhall-003")),
            DUNDAS_CENTRAL
        );
        assert_eq!(
            normalize_zone_id("ancaster", Some("aqi-an-gateway-001")),
            ANCASTER_GATEWAY
        );
    }

    #[test]
    fn subscription_filters_match_any_supported_alias() {
        let zones = vec![
            "waterfront".to_string(),
            "battlefield".to_string(),
            "dundas".to_string(),
        ];
        assert!(zones_filter_match(
            &zones,
            "north_end_west",
            Some("temp-wf-001")
        ));
        assert!(zones_filter_match(
            &zones,
            "battlefield",
            Some("temp-sc-001")
        ));
        assert!(zones_filter_match(
            &zones,
            "dundas_central",
            Some("temp-du-001")
        ));
        assert!(!zones_filter_match(
            &zones,
            "cootes_paradise",
            Some("temp-mc-001")
        ));
    }

    #[test]
    fn exposes_region_metadata_from_generated_tables() {
        assert_eq!(region_label(DOWNTOWN_CORE), Some("downtown core"));
        assert_eq!(region_label(WEST_MOUNTAIN), Some("west mountain"));
        assert_eq!(region_label("ward_1"), None);
    }

    #[test]
    fn exposes_canonical_region_ids() {
        assert_eq!(
            CANONICAL_REGION_IDS.first().copied(),
            Some(ANCASTER_GATEWAY)
        );
        assert_eq!(CANONICAL_REGION_IDS.last().copied(), Some(WEST_MOUNTAIN));
        assert!(CANONICAL_REGION_IDS.contains(&DOWNTOWN_CORE));
    }
}
