#!/usr/bin/env python3
"""ALEC V5: openWakeWord streaming nativo Windows, modelo opcional.

Executar após scripts/patch-ola-alec.py e scripts/patch-calibracao.py
no codigo original Roamies v0.1.49.
"""
from pathlib import Path
root = Path("upstream/showcase/tauri/src-tauri/voice-win")
src = root / "src"
main = src / "main.rs"
audio = src / "audio.rs"
cargo = root / "Cargo.toml"
m = main.read_text(encoding="utf-8")
a = audio.read_text(encoding="utf-8")
c = cargo.read_text(encoding="utf-8")

def once(s, old, new, where):
    count = s.count(old)
    if count != 1:
        raise RuntimeError(f"{where}: unexpected anchor count {count}, {old[:110]!r}")
    return s.replace(old, new, 1)

# Versao especifica publicada no crates.io; evita dependencia Python em Windows.
c = once(c,
    'serde_json = "=1.0.154"\n',
    'serde_json = "=1.0.154"\noww-rs = "=0.3.3"\n',
    "Cargo.toml")
m = once(m, "mod clap_learning;\n", "mod clap_learning;\nmod neuralwake;\n", "main.rs")
m = once(m, 'pub enum Ev {\n',
         'pub enum Ev {\n    NeuralWake(f32),\n    NeuralFailed(String),\n',
         "main.rs")
m = once(m, "    wake: wake::WakeWord,\n",
         "    wake: wake::WakeWord,\n    neural_tx: Option<std::sync::mpsc::SyncSender<Vec<f32>>>,\n",
         "main.rs")
m = once(m, "        Voice {\n",
         "        let neural_tx = neuralwake::start(tx.clone());\n        Voice {\n",
         "main.rs")
m = once(m, "            wake: wake::WakeWord::default(),\n",
         "            wake: wake::WakeWord::default(),\n            neural_tx,\n",
         "main.rs")
m = once(m, "        let sink = Sink::new(self.buf.clone(), self.tx.clone());\n",
         "        let sink = Sink::new(self.buf.clone(), self.tx.clone()).with_neural(\n"
         "            if self.phase == Phase::Wake { self.neural_tx.clone() } else { None }\n"
         "        );\n",
         "main.rs")
# A frase antiga é fallback e não corre ASR em segundo plano quando ONNX está pronto.
m = once(m,
         "    fn tick_wake(&mut self, now: f64) {\n",
         "    fn tick_wake(&mut self, now: f64) {\n"
         "        if self.neural_tx.is_some() { return; }\n",
         "main.rs")

handler = r'''    fn on_neural_wake(&mut self, confidence: f32) {
        if self.phase != Phase::Wake || !self.wake_on || self.wake_hold
            || self.neural_tx.is_none() {
            return;
        }
        log(&format!("alec neural: Hello Alex confirmado ({confidence:.2})"));
        self.listen_now(Some(8.0));
        self.needs_voice = true; // requer voz sustentada após o disparo
    }

'''
m = once(m, "    fn alec_activate_clap(&mut self, enabled: bool) {\n",
         handler + "    fn alec_activate_clap(&mut self, enabled: bool) {\n",
         "main.rs")

# Nunca transforma um erro do modelo em erro que fecha o assistente;
# a frase original volta a funcionar com o ASR já existente.
m = once(m, "        match ev {\n",
         "        match ev {\n"
         "            Ev::NeuralWake(score) => self.on_neural_wake(score),\n"
         "            Ev::NeuralFailed(err) => {\n"
         "                log(&format!(\"alec neural: modelo desactivado, fallback de voz ({err})\"));\n"
         "                self.neural_tx = None;\n"
         "            },\n",
         "main.rs")

# Opção de autodiagnóstico de compatibilidade ONNX.
m = once(m, "    if args.iter().any(|a| a == \"--perms\") {\n",
         "    if args.iter().any(|a| a == \"--test-neural\") {\n"
         "        match neuralwake::self_test() {\n"
         "            Ok(()) => { emit(json!({ \"type\": \"neural\", \"ok\": true })); }\n"
         "            Err(e) => { emit(json!({ \"type\": \"neural\", \"ok\": false, \"error\": e })); std::process::exit(1); }\n"
         "        }\n"
         "        return;\n"
         "    }\n"
         "    if args.iter().any(|a| a == \"--perms\") {\n",
         "main.rs")

# Adiciona um canal bounded para processamento em thread separada.
a = once(a,
         "use std::sync::mpsc::Sender;\n",
         "use std::sync::mpsc::{Sender, SyncSender, TrySendError};\n",
         "audio.rs")
a = once(a,
         "    clap: crate::clap::DoubleClap,\n",
         "    clap: crate::clap::DoubleClap,\n"
         "    neural_tx: Option<SyncSender<Vec<f32>>>,\n"
         "    neural_buf: Vec<f32>,\n",
         "audio.rs")
a = once(a,
         "calibrated: crate::clap_learning::Matcher::load() }",
         "calibrated: crate::clap_learning::Matcher::load(), neural_tx: None, neural_buf: Vec::new() }",
         "audio.rs")

builder = r'''
    pub fn with_neural(mut self, tx: Option<SyncSender<Vec<f32>>>) -> Self {
        self.neural_tx = tx;
        self
    }

'''
a = once(a, "    fn start(&mut self, rate: u32, channels: usize) {\n",
         builder + "    fn start(&mut self, rate: u32, channels: usize) {\n",
         "audio.rs")
neural_feed = r'''
        // O reconhecimento neural analisa o mesmo áudio 16kHz do Roamies.
        // NUNCA espera pelo worker no callback do microfone.
        if let Some(tx) = &self.neural_tx {
            self.neural_buf.extend_from_slice(&self.out);
            const FRAME: usize = 1280; // openWakeWord 80ms @ 16k
            while self.neural_buf.len() >= FRAME {
                let frame = self.neural_buf.drain(..FRAME).collect::<Vec<f32>>();
                match tx.try_send(frame) {
                    Ok(()) => {},
                    Err(TrySendError::Full(_)) => {}, // descarta se a CPU estiver ocupada
                    Err(TrySendError::Disconnected(_)) => { self.neural_tx = None; break; },
                }
            }
        }
'''
a = once(a, "        let double_clap = match self.calibrated.as_mut() {\n",
         neural_feed + "        let double_clap = match self.calibrated.as_mut() {\n",
         "audio.rs")

test = r'''
    #[test]
    fn alec_neural_wake_abre_escuta_sem_parakeet() {
        let (mut v, _jobs, wav) = voice();
        // Um worker simulado representa um modelo ONNX valido.
        v.neural_tx = Some(mpsc::sync_channel(3).0);
        v.handle(Ev::Cmd(json!({ "cmd": "wake", "on": true })));
        v.tick();
        assert_eq!(v.phase, Phase::Wake);
        v.on_neural_wake(0.9);
        assert_eq!(v.phase, Phase::HandsFree);
        assert!(v.needs_voice);
        let _ = std::fs::remove_file(wav);
    }

'''
m = once(m,
         "    #[test]\n    fn alec_palmada_dupla_ativa_handsfree_sem_falar() {",
         test + "    #[test]\n    fn alec_palmada_dupla_ativa_handsfree_sem_falar() {",
         "main.rs")

src.joinpath("neuralwake.rs").write_text(
    Path("scripts/neuralwake.rs").read_text(encoding="utf-8"),
    encoding="utf-8", newline="\n")
main.write_text(m, encoding="utf-8", newline="\n")
audio.write_text(a, encoding="utf-8", newline="\n")
cargo.write_text(c, encoding="utf-8", newline="\n")
print("ALEC V5: motor openWakeWord incorporado no helper. Modelo ONNX facultativo.")
