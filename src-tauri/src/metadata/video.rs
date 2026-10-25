use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use chrono::NaiveDateTime;
use nom_exif::{EntryValue, MediaParser, MediaSource, TrackInfo, TrackInfoTag};

#[derive(Default, Debug)]
pub struct ExtractedVideoMetadata {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub duration: Option<f64>,
    pub captured_at: Option<i64>,
    pub captured_at_local: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub altitude: Option<f64>,
}

pub struct VideoMetadataParser;

impl VideoMetadataParser {
    /// Non-blocking video metadata parsing: inspects ISO BMFF / QuickTime container atoms.
    pub fn parse<P: AsRef<Path>>(path: P) -> ExtractedVideoMetadata {
        let mut meta = ExtractedVideoMetadata::default();

        let mut parser = MediaParser::new();
        if let Ok(ms) = MediaSource::open(path.as_ref()) {
            if let Ok(track) = parser.parse_track(ms) {
                Self::extract_from_track(&track, &mut meta);
            }
        }

        // Fallback: If nom-exif didn't catch ISO 6709 location or mvhd creation date, scan QuickTime atoms
        if meta.captured_at.is_none() || meta.latitude.is_none() {
            if let Ok(mut f) = File::open(path.as_ref()) {
                Self::scan_quicktime_atoms(&mut f, &mut meta);
            }
        }

        meta
    }

    fn extract_from_track(track: &TrackInfo, meta: &mut ExtractedVideoMetadata) {
        if let Some(gps) = track.gps_info() {
            if let Some(lat) = gps.latitude.to_decimal_degrees() {
                meta.latitude = Some(lat * gps.latitude_ref.sign());
            }
            if let Some(lon) = gps.longitude.to_decimal_degrees() {
                meta.longitude = Some(lon * gps.longitude_ref.sign());
            }
            meta.altitude = gps.altitude.meters();
        }

        if let Some(val) = track.get(TrackInfoTag::CreateDate) {
            match val {
                EntryValue::DateTime(dt) => {
                    meta.captured_at_local = Some(dt.to_rfc3339());
                    meta.captured_at = Some(dt.timestamp_millis());
                }
                EntryValue::NaiveDateTime(ndt) => {
                    meta.captured_at_local = Some(ndt.to_string());
                    meta.captured_at = Some(ndt.and_utc().timestamp_millis());
                }
                EntryValue::Text(s) => {
                    meta.captured_at_local = Some(s.clone());
                    if let Ok(ndt) = NaiveDateTime::parse_from_str(s, "%Y:%m:%d %H:%M:%S") {
                        meta.captured_at = Some(ndt.and_utc().timestamp_millis());
                    }
                }
                _ => {}
            }
        }

        if let Some(val) = track.get(TrackInfoTag::DurationMs) {
            if let EntryValue::U64(ms) = val {
                meta.duration = Some(*ms as f64 / 1000.0);
            } else if let EntryValue::U32(ms) = val {
                meta.duration = Some(*ms as f64 / 1000.0);
            }
        }

        if let Some(val) = track.get(TrackInfoTag::Width) {
            if let EntryValue::U32(w) = val {
                meta.width = Some(*w);
            }
        }

        if let Some(val) = track.get(TrackInfoTag::Height) {
            if let EntryValue::U32(h) = val {
                meta.height = Some(*h);
            }
        }
    }

    /// Fast scan for MP4/MOV ISO 6709 location atom (©xyz / xyz)
    /// Format e.g.: "+34.0522-118.2437+100.000/"
    fn scan_quicktime_atoms(file: &mut File, meta: &mut ExtractedVideoMetadata) {
        const CHUNK_SIZE: usize = 8192;
        const OVERLAP: usize = 64;
        let mut buffer = [0u8; CHUNK_SIZE];
        if file.seek(SeekFrom::Start(0)).is_err() {
            return;
        }

        // Search the first 512KB for common location atom signatures
        let mut offset: u64 = 0;
        while offset < 524288 {
            if file.seek(SeekFrom::Start(offset)).is_err() {
                break;
            }
            let read_bytes = match file.read(&mut buffer) {
                Ok(n) if n > 0 => n,
                _ => break,
            };

            if Self::scan_buffer_for_iso6709(&buffer[..read_bytes], meta) {
                break;
            }

            if read_bytes < CHUNK_SIZE {
                break;
            }
            offset += (read_bytes - OVERLAP) as u64;
        }
    }

    fn scan_buffer_for_iso6709(buf: &[u8], meta: &mut ExtractedVideoMetadata) -> bool {
        if meta.latitude.is_some() || buf.len() < 8 {
            return false;
        }

        // Search for ©xyz or xyz atom marker safely within bounds
        for i in 0..buf.len().saturating_sub(4) {
            let marker_len = if buf[i..].starts_with(b"\xa9xyz") {
                4
            } else if buf[i..].starts_with(b"xyz") {
                3
            } else {
                continue;
            };

            let start = (i + marker_len).min(buf.len());
            let end = (start + 64).min(buf.len());
            let window = &buf[start..end];

            // QuickTime udta ©xyz boxes often have 4 binary header bytes (2B len + 2B lang code like 0x15 0xC7)
            // before the ASCII ISO 6709 string, and binary atom headers immediately after '/'.
            if let Some(coord_str) = Self::extract_ascii_iso6709_candidate(window) {
                if let Some((lat, lon)) = Self::parse_iso6709(&coord_str) {
                    if (-90.0..=90.0).contains(&lat) && (-180.0..=180.0).contains(&lon) {
                        meta.latitude = Some(lat);
                        meta.longitude = Some(lon);
                        return true;
                    }
                }
            }
        }

        false
    }

    fn extract_ascii_iso6709_candidate(window: &[u8]) -> Option<String> {
        // Locate first '+' or '-' followed by an ASCII digit within the first 12 bytes after the marker
        let max_prefix = window.len().min(12);
        let rel_start = (0..max_prefix).find(|&idx| {
            (window[idx] == b'+' || window[idx] == b'-')
                && window.get(idx + 1).map(|b| b.is_ascii_digit()).unwrap_or(false)
        })?;

        let mut candidate = String::with_capacity(32);
        for &b in &window[rel_start..] {
            if b.is_ascii_digit() || b == b'+' || b == b'-' || b == b'.' {
                candidate.push(b as char);
            } else if b == b'/' {
                candidate.push('/');
                break;
            } else {
                break;
            }
        }

        if candidate.len() >= 8 {
            Some(candidate)
        } else {
            None
        }
    }

    fn parse_iso6709(s: &str) -> Option<(f64, f64)> {
        // Typical string: "+34.0522-118.2437+100/" or "+34.0522-118.2437/"
        let trimmed = s.trim_matches(|c: char| !c.is_ascii_digit() && c != '+' && c != '-');
        let mut signs = Vec::new();
        for (idx, ch) in trimmed.char_indices() {
            if (ch == '+' || ch == '-') && idx > 0 {
                signs.push(idx);
            }
        }

        if !signs.is_empty() {
            let lat_str = &trimmed[0..signs[0]];
            let remainder = &trimmed[signs[0]..];
            let end_lon = remainder[1..]
                .find(|c| c == '+' || c == '-' || c == '/')
                .map(|idx| idx + 1)
                .unwrap_or(remainder.len());
            let lon_str = &remainder[0..end_lon];

            if let (Ok(lat), Ok(lon)) = (lat_str.parse::<f64>(), lon_str.parse::<f64>()) {
                return Some((lat, lon));
            }
        }

        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_iso6709_coordinates() {
        let res = VideoMetadataParser::parse_iso6709("+34.0522-118.2437/");
        assert!(res.is_some());
        let (lat, lon) = res.unwrap();
        assert!((lat - 34.0522).abs() < 1e-4);
        assert!((lon - (-118.2437)).abs() < 1e-4);

        let res2 = VideoMetadataParser::parse_iso6709("+51.5074-000.1278+015.000/");
        assert!(res2.is_some());
        let (lat2, lon2) = res2.unwrap();
        assert!((lat2 - 51.5074).abs() < 1e-4);
        assert!((lon2 - (-0.1278)).abs() < 1e-4);

        let invalid = VideoMetadataParser::parse_iso6709("invalid_non_coordinates");
        assert!(invalid.is_none());
    }

    #[test]
    fn test_scan_buffer_boundary_no_panic_and_binary_headers() {
        // Regression test for panic at offset 8170 in 8192-byte buffer (8170 + 32 = 8202 > 8192)
        let mut buf = vec![0u8; 8192];
        buf[8170..8174].copy_from_slice(b"\xa9xyz");
        let mut meta = ExtractedVideoMetadata::default();
        assert!(!VideoMetadataParser::scan_buffer_for_iso6709(&buf, &mut meta));

        // Also test marker at the very last valid bytes of buffer
        buf.fill(0);
        buf[8185..8188].copy_from_slice(b"xyz");
        assert!(!VideoMetadataParser::scan_buffer_for_iso6709(&buf, &mut meta));

        // Test realistic QuickTime udta ©xyz atom with non-UTF8 binary length/lang prefix and binary trailer
        let mut qt_buf = vec![0u8; 256];
        let atom = b"\xa9xyz\x00\x12\x15\xc7+34.0522-118.2437/\x00\x00\x00\x18\xff\xfe";
        qt_buf[120..120 + atom.len()].copy_from_slice(atom);
        assert!(VideoMetadataParser::scan_buffer_for_iso6709(&qt_buf, &mut meta));
        assert!((meta.latitude.unwrap() - 34.0522).abs() < 1e-4);
        assert!((meta.longitude.unwrap() - (-118.2437)).abs() < 1e-4);
    }
}
