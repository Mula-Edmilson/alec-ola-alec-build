// ALEC V4 - perfil acústico aprendido a partir de 3 gravações de palmada dupla.
// Trabalho local (16 kHz PCM). Guardamos apenas características numéricas,
// nunca WAV, voz, palavras, nem áudio bruto.
// Licença AGPL-3.0-only, tal como o Roamies de origem.
use std::path::PathBuf;

const RATE: usize = 16_000;
const BLOCK: usize = 160; // 10 ms
const MIN_GAP_MS: f64 = 125.0;
const MAX_GAP_MS: f64 = 950.0;

#[derive(Clone, Copy, Debug)]
pub struct Pattern {
    pub gap_ms: f64,
    pub hf1: f64,
    pub hf2: f64,
    pub crest1: f64,
    pub crest2: f64,
    pub loudness_balance: f64,
}
impl Pattern {
    fn is_valid(&self) -> bool {
        let vals = [self.gap_ms, self.hf1, self.hf2, self.crest1, self.crest2, self.loudness_balance];
        vals.iter().all(|v| v.is_finite()) &&
            (MIN_GAP_MS..=MAX_GAP_MS).contains(&self.gap_ms) &&
            (0.25..=2.1).contains(&self.hf1) && (0.25..=2.1).contains(&self.hf2) &&
            (1.2..=12.0).contains(&self.crest1) && (1.2..=12.0).contains(&self.crest2) &&
            (0.1..=10.0).contains(&self.loudness_balance)
    }
}
#[derive(Clone, Copy, Debug)]
struct Impulse {
    at: usize,
    rms: f64,
    hf: f64,
    crest: f64,
}
#[derive(Debug)]
struct Tracker {
    samples: usize,
    frame_count: usize,
    sum_sq: f64,
    sum_delta: f64,
    peak: f64,
    prev_sample: f64,
    prev_rms: f64,
    floor: f64,
    first: Option<Impulse>,
    last_impulse: usize,
    quiet_frames: usize,
}
impl Default for Tracker {
    fn default() -> Self {
        Self {
            samples: 0, frame_count: 0, sum_sq: 0.0, sum_delta: 0.0,
            peak: 0.0, prev_sample: 0.0, prev_rms: 0.0,
            floor: 0.003, first: None, last_impulse: 0, quiet_frames: 0,
        }
    }
}
impl Tracker {
    fn feed(&mut self, pcm: &[f32]) -> Option<Pattern> {
        let mut found = None;
        for &sample in pcm {
            let x = sample.clamp(-1.0, 1.0) as f64;
            let diff = x - self.prev_sample;
            self.prev_sample = x;
            self.sum_sq += x * x;
            self.sum_delta += diff * diff;
            self.peak = self.peak.max(x.abs());
            self.frame_count += 1;
            self.samples += 1;
            if self.frame_count == BLOCK {
                let candidate = self.frame();
                if found.is_none() { found = candidate; }
                self.frame_count = 0;
                self.sum_sq = 0.0;
                self.sum_delta = 0.0;
                self.peak = 0.0;
            }
        }
        found
    }
    fn frame(&mut self) -> Option<Pattern> {
        let rms = (self.sum_sq / BLOCK as f64).sqrt();
        let hf = (self.sum_delta / BLOCK as f64).sqrt() / rms.max(1e-7);
        let crest = self.peak / rms.max(1e-7);
        let floor = self.floor.max(0.0015);
        let quiet = rms < (floor * 2.6).max(0.012);
        if quiet { self.quiet_frames += 1; }
        if let Some(first) = self.first {
            if ((self.samples - first.at) as f64 * 1000.0 / RATE as f64) > MAX_GAP_MS {
                self.first = None;
                self.quiet_frames = 0;
            }
        }
        let transient = rms > (floor * 3.0).max(0.008)
            && self.peak > (floor * 5.0).max(0.016)
            && rms > self.prev_rms.max(0.002) * 1.32
            && hf > 0.38
            && crest > 1.28;
        // O baseline só segue ruído normal, e nunca a amplitude de um estalo.
        if quiet {
            self.floor = self.floor * 0.985 + rms * 0.015;
        } else if !transient {
            self.floor = self.floor * 0.9995 + rms.min(floor * 2.0) * 0.0005;
        }
        self.prev_rms = rms;
        if !transient || (self.last_impulse != 0 && self.samples - self.last_impulse < RATE / 10) {
            return None;
        }
        self.last_impulse = self.samples;
        let current = Impulse { at: self.samples, rms, hf, crest };
        if let Some(first) = self.first {
            let gap_ms = (current.at - first.at) as f64 * 1000.0 / RATE as f64;
            if gap_ms >= MIN_GAP_MS && gap_ms <= MAX_GAP_MS && self.quiet_frames >= 3 {
                self.first = None;
                self.quiet_frames = 0;
                let p = Pattern {
                    gap_ms, hf1: first.hf, hf2: current.hf,
                    crest1: first.crest, crest2: current.crest,
                    loudness_balance: current.rms / first.rms.max(1e-5),
                };
                if p.is_valid() { return Some(p); }
            }
        }
        self.first = Some(current);
        self.quiet_frames = 0;
        None
    }
}

pub fn extract(pcm: &[f32]) -> Option<Pattern> {
    let mut tracker = Tracker::default();
    // O tracker utiliza a mesma análise em streaming e no treino.
    let mut found = None;
    for chunk in pcm.chunks(BLOCK * 2) {
        if let Some(pair) = tracker.feed(chunk) {
            if found.is_some() { return None; } // mais que duas palmadas na gravação
            found = Some(pair);
        }
    }
    found
}
#[derive(Debug)]
pub struct Profile {
    pub templates: [Pattern; 3],
}
impl Profile {
    pub fn new(templates: [Pattern; 3]) -> Result<Self, String> {
        if templates.iter().all(Pattern::is_valid) {
            Ok(Self { templates })
        } else { Err("Pelo menos uma amostra tem características inválidas.".into()) }
    }
    pub fn save(&self, path: &std::path::Path) -> Result<(), String> {
        let models: Vec<_> = self.templates.iter().map(|p|
            serde_json::json!({
                "gap_ms":p.gap_ms,
                "hf1":p.hf1, "hf2":p.hf2,
                "crest1":p.crest1, "crest2":p.crest2,
                "loudness_balance":p.loudness_balance,
            })
        ).collect();
        let json = serde_json::json!({"version":1, "templates":models});
        let parent = path.parent().ok_or("Pasta de destino inválida")?;
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_vec_pretty(&json).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        if path.exists() { std::fs::remove_file(path).map_err(|e| e.to_string())?; }
        std::fs::rename(tmp, path).map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn load(path: &std::path::Path) -> Result<Self, String> {
        let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
        if bytes.len() > 16384 { return Err("Perfil demasiado grande".into()); }
        let data: serde_json::Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        if data["version"].as_i64() != Some(1) { return Err("Versão do perfil incompatível".into()); }
        let array = data["templates"].as_array().ok_or("Modelos inválidos")?;
        if array.len() != 3 { return Err("O perfil exige exactamente três exemplos".into()); }
        let mut list = Vec::new();
        for t in array {
            let num = |k| t.get(k).and_then(|x| x.as_f64()).ok_or_else(|| format!("Falta {k}"));
            list.push(Pattern {
                gap_ms:num("gap_ms")?,
                hf1:num("hf1")?, hf2:num("hf2")?,
                crest1:num("crest1")?, crest2:num("crest2")?,
                loudness_balance:num("loudness_balance")?,
            });
        }
        Self::new([list[0], list[1], list[2]])
    }
    fn match_score(&self, candidate: Pattern) -> Option<f64> {
        self.templates.iter().map(|t| {
            let gap = (candidate.gap_ms - t.gap_ms).abs() / (t.gap_ms * 0.5).max(145.0);
            let hf = ((candidate.hf1 - t.hf1).abs() + (candidate.hf2 - t.hf2).abs()) / 1.20;
            let crest = ((candidate.crest1 / t.crest1).ln().abs()
                + (candidate.crest2 / t.crest2).ln().abs()) / 1.65;
            let balance = (candidate.loudness_balance / t.loudness_balance).ln().abs() / 1.1;
            0.42 * gap + 0.28 * hf + 0.16 * crest + 0.14 * balance
        }).filter(|v| v.is_finite()).reduce(f64::min)
    }
    pub fn matches(&self, p: Pattern) -> bool {
        p.is_valid() && self.match_score(p).is_some_and(|v| v < 0.72)
    }
}
pub fn default_profile_path() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))
        .map(|home| PathBuf::from(home).join("Roamies").join("Data").join("alec-clap-profile.json"))
}

pub struct Matcher {
    tracker: Tracker,
    profile: Profile,
    cooldown_samples: usize,
}
impl Matcher {
    pub fn load() -> Option<Self> {
        let path = default_profile_path()?;
        let p = Profile::load(&path).ok()?;
        Some(Self { tracker: Tracker::default(), profile:p, cooldown_samples:0 })
    }
    #[cfg(test)]
    pub fn with_profile(profile: Profile) -> Self {
        Self { tracker: Tracker::default(), profile, cooldown_samples:0 }
    }
    pub fn feed(&mut self, samples: &[f32]) -> bool {
        let pattern = self.tracker.feed(samples);
        if self.tracker.samples < self.cooldown_samples { return false; }
        if let Some(p) = pattern {
            if self.profile.matches(p) {
                self.cooldown_samples = self.tracker.samples + RATE * 3;
                return true;
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn impulse(scale: f32, seed: &mut u32) -> Vec<f32> {
        (0..RATE / 45).map(|i| {
            *seed ^= *seed << 13;
            *seed ^= *seed >> 17;
            *seed ^= *seed << 5;
            let noise = (*seed as f64 / u32::MAX as f64 * 2.0 - 1.0) as f32;
            noise * scale * (1.0 - (i as f32 / (RATE / 45) as f32)).max(0.0)
        }).collect()
    }
    fn pair(gap_ms: usize, amplitude: f32, seed: u32) -> Vec<f32> {
        let mut s = seed;
        let mut out = vec![0.001f32; RATE / 3];
        out.extend(impulse(amplitude, &mut s));
        out.extend(vec![0.001; RATE * gap_ms / 1000]);
        out.extend(impulse(amplitude * 0.85, &mut s));
        out.extend(vec![0.001; RATE / 2]);
        out
    }
    #[test]
    fn extrai_tres_exemplos_de_palmadas() {
        for gap in [220, 350, 610] {
            let p = extract(&pair(gap, 0.28, gap as u32)).expect("par deve ser extraído");
            assert!((p.gap_ms - gap as f64).abs() < 50.0);
        }
    }
    #[test]
    fn perfil_guarda_apenas_caracteristicas() {
        let capture = [230, 320, 400].map(|gap| extract(&pair(gap, 0.3, gap as u32)).unwrap());
        let profile = Profile::new(capture).unwrap();
        let path = std::env::temp_dir().join(format!("alec-clap-profile-test-{}.json", std::process::id()));
        profile.save(&path).unwrap();
        let s = std::fs::read_to_string(&path).unwrap();
        assert!(s.contains("gap_ms"));
        assert!(!s.contains("WAVE"));
        let loaded = Profile::load(&path).unwrap();
        assert_eq!(loaded.templates.len(), 3);
        let _ = std::fs::remove_file(path);
    }
    #[test]
    fn reconhece_sons_semelhantes_com_intensidades_diferentes() {
        let profile = Profile::new([230, 350, 450].map(|gap|
            extract(&pair(gap, 0.30, gap as u32)).unwrap())).unwrap();
        let mut matcher = Matcher::with_profile(profile);
        let mut trigger = false;
        let p = pair(340, 0.13, 999);
        for block in p.chunks(317) {
            trigger |= matcher.feed(block);
        }
        assert!(trigger);
    }
    #[test]
    fn ignora_intervalos_muito_distantes() {
        let profile = Profile::new([220, 260, 300].map(|gap|
            extract(&pair(gap, 0.30, gap as u32)).unwrap())).unwrap();
        let mut matcher = Matcher::with_profile(profile);
        let mut trigger = false;
        for part in pair(880, 0.2, 77).chunks(333) {
            trigger |= matcher.feed(part);
        }
        assert!(!trigger);
    }
    #[test]
    fn uma_so_palmada_nao_corresponde() {
        let profile = Profile::new([230, 340, 470].map(|gap|
            extract(&pair(gap, 0.30, gap as u32)).unwrap())).unwrap();
        let mut matcher = Matcher::with_profile(profile);
        let mut single = vec![0.001f32; RATE / 3];
        let mut seed = 776u32;
        single.extend(impulse(0.4, &mut seed));
        single.extend(vec![0.001; RATE / 2]);
        assert!(!matcher.feed(&single));
    }
}
