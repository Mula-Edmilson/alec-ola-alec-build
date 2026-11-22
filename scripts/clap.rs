// ALEC Double Clap V1: dois transientes acústicos no PCM mono a 16 kHz.
// Sem ASR, internet, modelo adicional ou gravação de áudio.
const RATE: usize = 16000;
const WINDOW: usize = RATE / 100; // 10 ms
const MIN_GAP: u64 = (RATE as u64 * 16) / 100; // 160 ms
const MAX_GAP: u64 = (RATE as u64 * 70) / 100; // 700 ms
const REFRACTORY: u64 = (RATE as u64 * 12) / 100; // 120 ms
const COOLDOWN: u64 = RATE as u64 * 3;

#[derive(Debug)]
pub struct DoubleClap {
    samples: u64,
    count: usize,
    sum_sq: f64,
    diff_sq: f64,
    peak: f64,
    previous_sample: f64,
    previous_rms: f64,
    noise_rms: f64,
    first_clap: Option<u64>,
    quiet_windows: u32,
    refractory_until: u64,
    cooldown_until: u64,
}
impl Default for DoubleClap {
    fn default() -> Self {
        Self {
            samples: 0, count: 0, sum_sq: 0.0, diff_sq: 0.0, peak: 0.0,
            previous_sample: 0.0, previous_rms: 0.0, noise_rms: 0.004,
            first_clap: None, quiet_windows: 0, refractory_until: 0, cooldown_until: 0,
        }
    }
}
impl DoubleClap {
    // Compatível com callbacks de qualquer tamanho; mantém janelas de 10 ms.
    pub fn feed(&mut self, pcm: &[f32]) -> bool {
        let mut triggered = false;
        for &value in pcm {
            let x = value.clamp(-1.0, 1.0) as f64;
            let diff = x - self.previous_sample;
            self.previous_sample = x;
            self.sum_sq += x * x;
            self.diff_sq += diff * diff;
            self.peak = self.peak.max(x.abs());
            self.samples += 1;
            self.count += 1;
            if self.count == WINDOW {
                triggered |= self.frame();
                self.count = 0;
                self.sum_sq = 0.0;
                self.diff_sq = 0.0;
                self.peak = 0.0;
            }
        }
        triggered
    }
    fn frame(&mut self) -> bool {
        let rms = (self.sum_sq / WINDOW as f64).sqrt();
        let high = (self.diff_sq / WINDOW as f64).sqrt();
        let crest = self.peak / rms.max(1e-8);
        let baseline = self.noise_rms.max(0.002);
        let quiet = rms < (baseline * 2.7).max(0.014);
        if quiet { self.quiet_windows = self.quiet_windows.saturating_add(1); }
        if let Some(first) = self.first_clap {
            if self.samples.saturating_sub(first) > MAX_GAP {
                self.first_clap = None;
                self.quiet_windows = 0;
            }
        }
        // Um impulso forte, súbito e de banda larga, acima do ruído ambiente.
        let candidate = self.samples >= self.refractory_until
            && self.samples >= self.cooldown_until
            && rms > (baseline * 4.2).max(0.016)
            && self.peak > (baseline * 11.0).max(0.05)
            && rms > self.previous_rms.max(0.003) * 1.8
            && high / rms.max(1e-8) > 0.72
            && crest > 1.8;
        if quiet {
            self.noise_rms = 0.975 * baseline + 0.025 * rms;
        } else if !candidate {
            self.noise_rms = 0.999 * baseline + 0.001 * rms.min(baseline * 3.0);
        }
        self.previous_rms = rms;
        if !candidate { return false; }
        self.refractory_until = self.samples + REFRACTORY;
        if let Some(first) = self.first_clap {
            let elapsed = self.samples.saturating_sub(first);
            if (MIN_GAP..=MAX_GAP).contains(&elapsed) && self.quiet_windows >= 4 {
                self.first_clap = None;
                self.quiet_windows = 0;
                self.cooldown_until = self.samples + COOLDOWN;
                return true;
            }
            if elapsed >= MIN_GAP {
                self.first_clap = Some(self.samples);
                self.quiet_windows = 0;
            }
        } else {
            self.first_clap = Some(self.samples);
            self.quiet_windows = 0;
        }
        false
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn silence(d: &mut DoubleClap, ms: usize) -> bool {
        d.feed(&vec![0.001; ms * RATE / 1000])
    }
    fn clap(d: &mut DoubleClap) -> bool {
        let mut state = 0x1c0ffee1u32;
        let mut pcm = Vec::with_capacity(RATE / 50);
        for i in 0..RATE / 50 {
            state ^= state << 13;
            state ^= state >> 17;
            state ^= state << 5;
            let white = (state as f64 / u32::MAX as f64 * 2.0 - 1.0) as f32;
            pcm.push(white * (1.0 - i as f32 / (RATE / 50) as f32) * 0.3);
        }
        d.feed(&pcm)
    }
    fn pair(ms: usize) -> bool {
        let mut d = DoubleClap::default();
        let mut triggered = silence(&mut d, 300);
        triggered |= clap(&mut d);
        triggered |= silence(&mut d, ms);
        triggered |= clap(&mut d);
        triggered
    }
    #[test]
    fn duas_palmadas_ativam() {
        for gap in [160, 230, 350, 500, 650] {
            assert!(pair(gap), "gap: {gap} ms");
        }
    }
    #[test]
    fn uma_palmada_nao_ativa() {
        let mut d = DoubleClap::default();
        assert!(!silence(&mut d, 300));
        assert!(!clap(&mut d));
        assert!(!silence(&mut d, 1000));
    }
    #[test]
    fn intervalo_demasiado_grande_nao_ativa() { assert!(!pair(900)); }
    #[test]
    fn intervalo_curto_nao_ativa() { assert!(!pair(50)); }
    #[test]
    fn voz_e_musica_nao_ativam() {
        let mut d = DoubleClap::default();
        let pcm: Vec<f32> = (0..RATE * 4).map(|i| {
            let t = i as f64 / RATE as f64;
            let amp = if (t * 3.0).fract() < 0.5 { 0.075 } else { 0.012 };
            (amp * (t * 2.0 * std::f64::consts::PI * 190.0).sin()) as f32
        }).collect();
        assert!(!d.feed(&pcm));
    }
    #[test]
    fn ruido_continuo_nao_ativa() {
        let mut d = DoubleClap::default();
        let mut state = 0x12345678u32;
        let pcm: Vec<f32> = (0..RATE * 4).map(|_| {
            state ^= state << 13; state ^= state >> 17; state ^= state << 5;
            (state as f64 / u32::MAX as f64 * 2.0 - 1.0) as f32 * 0.015
        }).collect();
        assert!(!d.feed(&pcm));
    }
    #[test]
    fn apos_ativar_ha_cooldown() {
        let mut d = DoubleClap::default();
        silence(&mut d, 300);
        assert!(!clap(&mut d));
        silence(&mut d, 300);
        assert!(clap(&mut d));
        assert!(!silence(&mut d, 200));
        assert!(!clap(&mut d));
        silence(&mut d, 350);
        assert!(!clap(&mut d));
    }
    #[test]
    fn callbacks_de_tamanho_variavel() {
        let mut stream = vec![0.001f32; RATE / 2];
        let mut state = 0x1c0ffee1u32;
        let pulse = |state: &mut u32| -> Vec<f32> {
            (0..RATE / 50).map(|i| {
                *state ^= *state << 13;
                *state ^= *state >> 17;
                *state ^= *state << 5;
                (*state as f64 / u32::MAX as f64 * 2.0 - 1.0) as f32
                    * (1.0 - i as f32 / (RATE / 50) as f32) * 0.3
            }).collect()
        };
        stream.extend(pulse(&mut state));
        stream.extend(vec![0.001; RATE / 3]);
        stream.extend(pulse(&mut state));
        let mut d = DoubleClap::default();
        let mut detected = false;
        for chunk in stream.chunks(317) { detected |= d.feed(chunk); }
        assert!(detected);
    }
}