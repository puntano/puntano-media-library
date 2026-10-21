pub struct GazetteerEntry {
    pub city: &'static str,
    pub region: &'static str,
    pub country: &'static str,
    pub country_code: &'static str,
    pub lat: f64,
    pub lon: f64,
    pub radius_deg: f64,
}

/// Curated embedded offline gazetteer for zero-network reverse geocoding and place-name search.
const GAZETTEER: &[GazetteerEntry] = &[
    // North America
    GazetteerEntry { city: "San Francisco", region: "California", country: "United States", country_code: "US", lat: 37.7749, lon: -122.4194, radius_deg: 0.6 },
    GazetteerEntry { city: "Los Angeles", region: "California", country: "United States", country_code: "US", lat: 34.0522, lon: -118.2437, radius_deg: 0.8 },
    GazetteerEntry { city: "San Diego", region: "California", country: "United States", country_code: "US", lat: 32.7157, lon: -117.1611, radius_deg: 0.5 },
    GazetteerEntry { city: "San Jose", region: "California", country: "United States", country_code: "US", lat: 37.3382, lon: -121.8863, radius_deg: 0.45 },
    GazetteerEntry { city: "Yosemite Valley", region: "California", country: "United States", country_code: "US", lat: 37.7456, lon: -119.5936, radius_deg: 0.5 },
    GazetteerEntry { city: "Seattle", region: "Washington", country: "United States", country_code: "US", lat: 47.6062, lon: -122.3321, radius_deg: 0.6 },
    GazetteerEntry { city: "Portland", region: "Oregon", country: "United States", country_code: "US", lat: 45.5152, lon: -122.6784, radius_deg: 0.5 },
    GazetteerEntry { city: "Las Vegas", region: "Nevada", country: "United States", country_code: "US", lat: 36.1699, lon: -115.1398, radius_deg: 0.5 },
    GazetteerEntry { city: "Phoenix", region: "Arizona", country: "United States", country_code: "US", lat: 33.4484, lon: -112.0740, radius_deg: 0.6 },
    GazetteerEntry { city: "Denver", region: "Colorado", country: "United States", country_code: "US", lat: 39.7392, lon: -104.9903, radius_deg: 0.6 },
    GazetteerEntry { city: "Austin", region: "Texas", country: "United States", country_code: "US", lat: 30.2672, lon: -97.7431, radius_deg: 0.5 },
    GazetteerEntry { city: "Dallas", region: "Texas", country: "United States", country_code: "US", lat: 32.7767, lon: -96.7970, radius_deg: 0.6 },
    GazetteerEntry { city: "Houston", region: "Texas", country: "United States", country_code: "US", lat: 29.7604, lon: -95.3698, radius_deg: 0.6 },
    GazetteerEntry { city: "Chicago", region: "Illinois", country: "United States", country_code: "US", lat: 41.8781, lon: -87.6298, radius_deg: 0.6 },
    GazetteerEntry { city: "New York", region: "New York", country: "United States", country_code: "US", lat: 40.7128, lon: -74.0060, radius_deg: 0.7 },
    GazetteerEntry { city: "Boston", region: "Massachusetts", country: "United States", country_code: "US", lat: 42.3601, lon: -71.0589, radius_deg: 0.5 },
    GazetteerEntry { city: "Washington", region: "D.C.", country: "United States", country_code: "US", lat: 38.9072, lon: -77.0369, radius_deg: 0.5 },
    GazetteerEntry { city: "Miami", region: "Florida", country: "United States", country_code: "US", lat: 25.7617, lon: -80.1918, radius_deg: 0.6 },
    GazetteerEntry { city: "Orlando", region: "Florida", country: "United States", country_code: "US", lat: 28.5383, lon: -81.3792, radius_deg: 0.5 },
    GazetteerEntry { city: "Honolulu", region: "Hawaii", country: "United States", country_code: "US", lat: 21.3069, lon: -157.8583, radius_deg: 0.6 },
    GazetteerEntry { city: "Toronto", region: "Ontario", country: "Canada", country_code: "CA", lat: 43.6532, lon: -79.3832, radius_deg: 0.6 },
    GazetteerEntry { city: "Vancouver", region: "British Columbia", country: "Canada", country_code: "CA", lat: 49.2827, lon: -123.1207, radius_deg: 0.6 },
    GazetteerEntry { city: "Montreal", region: "Quebec", country: "Canada", country_code: "CA", lat: 45.5017, lon: -73.5673, radius_deg: 0.6 },
    GazetteerEntry { city: "Mexico City", region: "CDMX", country: "Mexico", country_code: "MX", lat: 19.4326, lon: -99.1332, radius_deg: 0.7 },
    GazetteerEntry { city: "Cancun", region: "Quintana Roo", country: "Mexico", country_code: "MX", lat: 21.1619, lon: -86.8515, radius_deg: 0.6 },

    // South America (including San Luis / Argentina highlights)
    GazetteerEntry { city: "San Luis", region: "San Luis", country: "Argentina", country_code: "AR", lat: -33.3017, lon: -66.3378, radius_deg: 0.8 },
    GazetteerEntry { city: "Potrero de los Funes", region: "San Luis", country: "Argentina", country_code: "AR", lat: -33.2208, lon: -66.2281, radius_deg: 0.35 },
    GazetteerEntry { city: "Villa de Merlo", region: "San Luis", country: "Argentina", country_code: "AR", lat: -32.3429, lon: -65.0139, radius_deg: 0.45 },
    GazetteerEntry { city: "Villa Mercedes", region: "San Luis", country: "Argentina", country_code: "AR", lat: -33.6757, lon: -65.4578, radius_deg: 0.45 },
    GazetteerEntry { city: "Buenos Aires", region: "CABA", country: "Argentina", country_code: "AR", lat: -34.6037, lon: -58.3816, radius_deg: 0.8 },
    GazetteerEntry { city: "Cordoba", region: "Cordoba", country: "Argentina", country_code: "AR", lat: -31.4201, lon: -64.1888, radius_deg: 0.7 },
    GazetteerEntry { city: "Mendoza", region: "Mendoza", country: "Argentina", country_code: "AR", lat: -32.8895, lon: -68.8458, radius_deg: 0.7 },
    GazetteerEntry { city: "Rosario", region: "Santa Fe", country: "Argentina", country_code: "AR", lat: -32.9442, lon: -60.6505, radius_deg: 0.5 },
    GazetteerEntry { city: "San Carlos de Bariloche", region: "Rio Negro", country: "Argentina", country_code: "AR", lat: -41.1335, lon: -71.3103, radius_deg: 0.7 },
    GazetteerEntry { city: "Salta", region: "Salta", country: "Argentina", country_code: "AR", lat: -24.7821, lon: -65.4232, radius_deg: 0.6 },
    GazetteerEntry { city: "Ushuaia", region: "Tierra del Fuego", country: "Argentina", country_code: "AR", lat: -54.8019, lon: -68.3030, radius_deg: 0.6 },
    GazetteerEntry { city: "Santiago", region: "Metropolitana", country: "Chile", country_code: "CL", lat: -33.4489, lon: -70.6693, radius_deg: 0.7 },
    GazetteerEntry { city: "Sao Paulo", region: "SP", country: "Brazil", country_code: "BR", lat: -23.5505, lon: -46.6333, radius_deg: 0.8 },
    GazetteerEntry { city: "Rio de Janeiro", region: "RJ", country: "Brazil", country_code: "BR", lat: -22.9068, lon: -43.1729, radius_deg: 0.7 },
    GazetteerEntry { city: "Lima", region: "Lima", country: "Peru", country_code: "PE", lat: -12.0464, lon: -77.0428, radius_deg: 0.7 },
    GazetteerEntry { city: "Cusco", region: "Cusco", country: "Peru", country_code: "PE", lat: -13.5320, lon: -71.9675, radius_deg: 0.6 },
    GazetteerEntry { city: "Bogota", region: "Cundinamarca", country: "Colombia", country_code: "CO", lat: 4.7110, lon: -74.0721, radius_deg: 0.7 },
    GazetteerEntry { city: "Montevideo", region: "Montevideo", country: "Uruguay", country_code: "UY", lat: -34.9011, lon: -56.1645, radius_deg: 0.6 },

    // Europe
    GazetteerEntry { city: "London", region: "England", country: "United Kingdom", country_code: "GB", lat: 51.5074, lon: -0.1278, radius_deg: 0.7 },
    GazetteerEntry { city: "Edinburgh", region: "Scotland", country: "United Kingdom", country_code: "GB", lat: 55.9533, lon: -3.1883, radius_deg: 0.5 },
    GazetteerEntry { city: "Paris", region: "Ile-de-France", country: "France", country_code: "FR", lat: 48.8566, lon: 2.3522, radius_deg: 0.7 },
    GazetteerEntry { city: "Nice", region: "Provence-Alpes-Cote d'Azur", country: "France", country_code: "FR", lat: 43.7102, lon: 7.2620, radius_deg: 0.5 },
    GazetteerEntry { city: "Lyon", region: "Auvergne-Rhone-Alpes", country: "France", country_code: "FR", lat: 45.7640, lon: 4.8357, radius_deg: 0.5 },
    GazetteerEntry { city: "Madrid", region: "Madrid", country: "Spain", country_code: "ES", lat: 40.4168, lon: -3.7038, radius_deg: 0.7 },
    GazetteerEntry { city: "Barcelona", region: "Catalonia", country: "Spain", country_code: "ES", lat: 41.3851, lon: 2.1734, radius_deg: 0.6 },
    GazetteerEntry { city: "Seville", region: "Andalusia", country: "Spain", country_code: "ES", lat: 37.3891, lon: -5.9845, radius_deg: 0.5 },
    GazetteerEntry { city: "Valencia", region: "Valencia", country: "Spain", country_code: "ES", lat: 39.4699, lon: -0.3763, radius_deg: 0.5 },
    GazetteerEntry { city: "Lisbon", region: "Lisbon", country: "Portugal", country_code: "PT", lat: 38.7223, lon: -9.1393, radius_deg: 0.6 },
    GazetteerEntry { city: "Porto", region: "Porto", country: "Portugal", country_code: "PT", lat: 41.1579, lon: -8.6291, radius_deg: 0.5 },
    GazetteerEntry { city: "Rome", region: "Lazio", country: "Italy", country_code: "IT", lat: 41.9028, lon: 12.4964, radius_deg: 0.7 },
    GazetteerEntry { city: "Milan", region: "Lombardy", country: "Italy", country_code: "IT", lat: 45.4642, lon: 9.1900, radius_deg: 0.6 },
    GazetteerEntry { city: "Florence", region: "Tuscany", country: "Italy", country_code: "IT", lat: 43.7696, lon: 11.2558, radius_deg: 0.5 },
    GazetteerEntry { city: "Venice", region: "Veneto", country: "Italy", country_code: "IT", lat: 45.4408, lon: 12.3155, radius_deg: 0.5 },
    GazetteerEntry { city: "Naples", region: "Campania", country: "Italy", country_code: "IT", lat: 40.8518, lon: 14.2681, radius_deg: 0.5 },
    GazetteerEntry { city: "Berlin", region: "Berlin", country: "Germany", country_code: "DE", lat: 52.5200, lon: 13.4050, radius_deg: 0.7 },
    GazetteerEntry { city: "Munich", region: "Bavaria", country: "Germany", country_code: "DE", lat: 48.1351, lon: 11.5820, radius_deg: 0.6 },
    GazetteerEntry { city: "Frankfurt", region: "Hesse", country: "Germany", country_code: "DE", lat: 50.1109, lon: 8.6821, radius_deg: 0.5 },
    GazetteerEntry { city: "Hamburg", region: "Hamburg", country: "Germany", country_code: "DE", lat: 53.5511, lon: 9.9937, radius_deg: 0.5 },
    GazetteerEntry { city: "Amsterdam", region: "North Holland", country: "Netherlands", country_code: "NL", lat: 52.3676, lon: 4.9041, radius_deg: 0.5 },
    GazetteerEntry { city: "Brussels", region: "Brussels", country: "Belgium", country_code: "BE", lat: 50.8503, lon: 4.3517, radius_deg: 0.5 },
    GazetteerEntry { city: "Zurich", region: "Zurich", country: "Switzerland", country_code: "CH", lat: 47.3769, lon: 8.5417, radius_deg: 0.5 },
    GazetteerEntry { city: "Geneva", region: "Geneva", country: "Switzerland", country_code: "CH", lat: 46.2044, lon: 6.1432, radius_deg: 0.5 },
    GazetteerEntry { city: "Vienna", region: "Vienna", country: "Austria", country_code: "AT", lat: 48.2082, lon: 16.3738, radius_deg: 0.6 },
    GazetteerEntry { city: "Prague", region: "Prague", country: "Czechia", country_code: "CZ", lat: 50.0755, lon: 14.4378, radius_deg: 0.5 },
    GazetteerEntry { city: "Warsaw", region: "Masovia", country: "Poland", country_code: "PL", lat: 52.2297, lon: 21.0122, radius_deg: 0.6 },
    GazetteerEntry { city: "Budapest", region: "Budapest", country: "Hungary", country_code: "HU", lat: 47.4979, lon: 19.0402, radius_deg: 0.6 },
    GazetteerEntry { city: "Athens", region: "Attica", country: "Greece", country_code: "GR", lat: 37.9838, lon: 23.7275, radius_deg: 0.6 },
    GazetteerEntry { city: "Stockholm", region: "Stockholm", country: "Sweden", country_code: "SE", lat: 59.3293, lon: 18.0686, radius_deg: 0.6 },
    GazetteerEntry { city: "Copenhagen", region: "Capital", country: "Denmark", country_code: "DK", lat: 55.6761, lon: 12.5683, radius_deg: 0.5 },
    GazetteerEntry { city: "Oslo", region: "Oslo", country: "Norway", country_code: "NO", lat: 59.9139, lon: 10.7522, radius_deg: 0.5 },
    GazetteerEntry { city: "Dublin", region: "Leinster", country: "Ireland", country_code: "IE", lat: 53.3498, lon: -6.2603, radius_deg: 0.5 },
    GazetteerEntry { city: "Istanbul", region: "Marmara", country: "Turkey", country_code: "TR", lat: 41.0082, lon: 28.9784, radius_deg: 0.7 },

    // Asia & Middle East
    GazetteerEntry { city: "Tokyo", region: "Kanto", country: "Japan", country_code: "JP", lat: 35.6762, lon: 139.6503, radius_deg: 0.8 },
    GazetteerEntry { city: "Kyoto", region: "Kansai", country: "Japan", country_code: "JP", lat: 35.0116, lon: 135.7681, radius_deg: 0.5 },
    GazetteerEntry { city: "Osaka", region: "Kansai", country: "Japan", country_code: "JP", lat: 34.6937, lon: 135.5023, radius_deg: 0.6 },
    GazetteerEntry { city: "Seoul", region: "Seoul", country: "South Korea", country_code: "KR", lat: 37.5665, lon: 126.9780, radius_deg: 0.7 },
    GazetteerEntry { city: "Taipei", region: "Taiwan", country: "Taiwan", country_code: "TW", lat: 25.0330, lon: 121.5654, radius_deg: 0.6 },
    GazetteerEntry { city: "Hong Kong", region: "Hong Kong", country: "Hong Kong", country_code: "HK", lat: 22.3193, lon: 114.1694, radius_deg: 0.5 },
    GazetteerEntry { city: "Singapore", region: "Singapore", country: "Singapore", country_code: "SG", lat: 1.3521, lon: 103.8198, radius_deg: 0.5 },
    GazetteerEntry { city: "Bangkok", region: "Bangkok", country: "Thailand", country_code: "TH", lat: 13.7563, lon: 100.5018, radius_deg: 0.7 },
    GazetteerEntry { city: "Bali", region: "Bali", country: "Indonesia", country_code: "ID", lat: -8.4095, lon: 115.1889, radius_deg: 0.7 },
    GazetteerEntry { city: "Dubai", region: "Dubai", country: "United Arab Emirates", country_code: "AE", lat: 25.2048, lon: 55.2708, radius_deg: 0.6 },
    GazetteerEntry { city: "Mumbai", region: "Maharashtra", country: "India", country_code: "IN", lat: 19.0760, lon: 72.8777, radius_deg: 0.7 },
    GazetteerEntry { city: "New Delhi", region: "Delhi", country: "India", country_code: "IN", lat: 28.6139, lon: 77.2090, radius_deg: 0.7 },
    GazetteerEntry { city: "Beijing", region: "Beijing", country: "China", country_code: "CN", lat: 39.9042, lon: 116.4074, radius_deg: 0.8 },
    GazetteerEntry { city: "Shanghai", region: "Shanghai", country: "China", country_code: "CN", lat: 31.2304, lon: 121.4737, radius_deg: 0.8 },

    // Oceania & Africa
    GazetteerEntry { city: "Sydney", region: "New South Wales", country: "Australia", country_code: "AU", lat: -33.8688, lon: 151.2093, radius_deg: 0.7 },
    GazetteerEntry { city: "Melbourne", region: "Victoria", country: "Australia", country_code: "AU", lat: -37.8136, lon: 144.9631, radius_deg: 0.7 },
    GazetteerEntry { city: "Auckland", region: "Auckland", country: "New Zealand", country_code: "NZ", lat: -36.8485, lon: 174.7633, radius_deg: 0.6 },
    GazetteerEntry { city: "Queenstown", region: "Otago", country: "New Zealand", country_code: "NZ", lat: -45.0312, lon: 168.6626, radius_deg: 0.6 },
    GazetteerEntry { city: "Cape Town", region: "Western Cape", country: "South Africa", country_code: "ZA", lat: -33.9249, lon: 18.4241, radius_deg: 0.6 },
    GazetteerEntry { city: "Cairo", region: "Cairo", country: "Egypt", country_code: "EG", lat: 30.0444, lon: 31.2357, radius_deg: 0.7 },
    GazetteerEntry { city: "Marrakesh", region: "Marrakesh-Safi", country: "Morocco", country_code: "MA", lat: 31.6295, lon: -7.9811, radius_deg: 0.6 },
];

pub struct ReverseGeocoder;

impl ReverseGeocoder {
    /// Calculates Haversine great-circle distance in kilometers between two (lat, lon) coordinates.
    pub fn haversine_km(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
        const EARTH_RADIUS_KM: f64 = 6371.0;
        let d_lat = (lat2 - lat1).to_radians();
        let d_lon = (lon2 - lon1).to_radians();
        let r_lat1 = lat1.to_radians();
        let r_lat2 = lat2.to_radians();

        let a = (d_lat / 2.0).sin().powi(2)
            + r_lat1.cos() * r_lat2.cos() * (d_lon / 2.0).sin().powi(2);
        let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());
        EARTH_RADIUS_KM * c
    }

    /// Resolves (latitude, longitude) to a human-readable location string ("City, Country")
    /// if within 120 km of a known gazetteer entry.
    pub fn resolve_location(latitude: f64, longitude: f64) -> Option<String> {
        let mut best_entry: Option<&GazetteerEntry> = None;
        let mut min_dist_km = f64::MAX;

        for entry in GAZETTEER {
            let dist = Self::haversine_km(latitude, longitude, entry.lat, entry.lon);
            if dist < min_dist_km {
                min_dist_km = dist;
                best_entry = Some(entry);
            }
        }

        if let Some(entry) = best_entry {
            if min_dist_km <= 85.0 {
                return Some(format!("{}, {}", entry.city, entry.country));
            } else if min_dist_km <= 160.0 {
                return Some(format!("Near {}, {}", entry.city, entry.country));
            }
        }

        None
    }

    /// Finds bounding boxes `(min_lat, max_lat, min_lon, max_lon)` for any gazetteer entries
    /// whose city, region, or country matches the query string.
    pub fn find_matching_bounding_boxes(query: &str) -> Vec<(f64, f64, f64, f64)> {
        let q = query.trim().to_lowercase();
        if q.len() < 3 {
            return Vec::new();
        }

        let mut boxes = Vec::new();
        for entry in GAZETTEER {
            let city_match = entry.city.to_lowercase().contains(&q);
            let region_match = entry.region.to_lowercase().contains(&q);
            let country_match = entry.country.to_lowercase().contains(&q);

            if city_match || region_match || country_match {
                boxes.push((
                    entry.lat - entry.radius_deg,
                    entry.lat + entry.radius_deg,
                    entry.lon - entry.radius_deg,
                    entry.lon + entry.radius_deg,
                ));
            }
        }

        boxes
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_location_cities() {
        let sf = ReverseGeocoder::resolve_location(37.7749, -122.4194);
        assert_eq!(sf.as_deref(), Some("San Francisco, United States"));

        let san_luis = ReverseGeocoder::resolve_location(-33.3017, -66.3378);
        assert_eq!(san_luis.as_deref(), Some("San Luis, Argentina"));

        let tokyo = ReverseGeocoder::resolve_location(35.6762, 139.6503);
        assert_eq!(tokyo.as_deref(), Some("Tokyo, Japan"));

        // Middle of Pacific Ocean -> None
        let ocean = ReverseGeocoder::resolve_location(0.0, -160.0);
        assert!(ocean.is_none());
    }

    #[test]
    fn test_find_matching_bounding_boxes() {
        let sf_boxes = ReverseGeocoder::find_matching_bounding_boxes("San Francisco");
        assert_eq!(sf_boxes.len(), 1);
        let (min_lat, max_lat, min_lon, max_lon) = sf_boxes[0];
        assert!(37.7749 >= min_lat && 37.7749 <= max_lat);
        assert!(-122.4194 >= min_lon && -122.4194 <= max_lon);

        let japan_boxes = ReverseGeocoder::find_matching_bounding_boxes("Japan");
        assert!(japan_boxes.len() >= 3);
    }
}
