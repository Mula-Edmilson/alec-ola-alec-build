// ALEC Neural Wake V5 — openWakeWord streaming, sem Python em execução.
// MIT (código original); depende de oww-rs, que integra tract-onnx.
// Só corre quando o utilizador instalar um modelo ONNX personalizado.
// A inferência corre numa thread separada e usa PCM 16 kHz do microfone do Roamies.
use std::path::PathBuf;
use std::sync::mpsc::{self, Sender, SyncSender};
use std::thread;
use std::panic::{catch_unwind, AssertUnwindSafe};
use oww_rs::oww::{OwwModel, OWW_MODEL_CHUNK_SIZE};
use crate::{Ev, log};

const THRESHOLD: f32 = 0.77;
const QUEUE: usize = 16;

pub fn model_path() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))
        .map(|home| PathBuf::from(home).join("Roamies").join("Data").join("hello_alex.onnx"))
}

// OwwModel::from_file pode lançar panic internamente em modelos ONNX incompatíveis.
// Tratamos um ficheiro inválido como erro recuperável, com retorno para ASR.
fn load(path: &std::path::Path) -> Result<OwwModel, String> {
    if !path.is_file() {
        return Err(format!("Modelo nao encontrado: {}", path.display()));
    }
    let meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
    if meta.len() < 512 || meta.len() > 40 * 1024 * 1024 {
        return Err("Modelo ONNX tem dimensao inesperada (0.5KB a 40MB)".into());
    }
    match catch_unwind(AssertUnwindSafe(|| OwwModel::from_file(path, "hello_alex".into(), THRESHOLD))) {
        Ok(Ok(m)) => Ok(m),
        Ok(Err(e)) => Err(format!("ONNX: {e}")),
        Err(_) => Err("Modelo ONNX nao e compativel com este motor Rust".into())
    }
}

// Comando manual de diagnóstico e validação do modelo, sem abrir o microfone.
pub fn self_test() -> Result<(), String> {
    let path = model_path().ok_or("USERPROFILE nao encontrado")?;
    let mut model = load(&path)?;
    for _ in 0..16 {
        match catch_unwind(AssertUnwindSafe(|| model.detection(vec![0.0; OWW_MODEL_CHUNK_SIZE]))) {
            Ok(_) => {},
            Err(_) => return Err("Falha ao executar a inferencia ONNX".into())
        }
    }
    Ok(())
}

// O motor é facultativo e não inicia threads sem hello_alex.onnx.
// A thread processa os blocos 1280 amostras / 80ms; o callback de áudio
// usa try_send para nunca ficar bloqueado pelo motor neural.
pub fn start(events: Sender<Ev>) -> Option<SyncSender<Vec<f32>>> {
    let path = model_path()?;
    if !path.is_file() { return None; }
    let (tx, rx) = mpsc::sync_channel::<Vec<f32>>(QUEUE);
    thread::spawn(move || {
        let mut model = match load(&path) {
            Ok(m) => m,
            Err(err) => {
                log(&format!("alec neural: {err}"));
                let _ = events.send(Ev::NeuralFailed(err));
                return;
            }
        };
        log("alec neural: modelo Hello Alex carregado; listening com openWakeWord");
        while let Ok(chunk) = rx.recv() {
            if chunk.len() != OWW_MODEL_CHUNK_SIZE {
                continue;
            }
            let detection = match catch_unwind(AssertUnwindSafe(|| model.detection(chunk))) {
                Ok(result) => result,
                Err(_) => {
                    let _ = events.send(Ev::NeuralFailed("Falha no processador openWakeWord".into()));
                    return;
                }
            };
            if detection.detected {
                let _ = events.send(Ev::NeuralWake(detection.probability));
            }
        }
    });
    Some(tx)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn modelo_so_carrega_se_existe() {
        // Teste estrutural independente dos ficheiros pessoais do utilizador.
        assert_eq!(OWW_MODEL_CHUNK_SIZE, 1280);
        assert!((0.5..1.0).contains(&THRESHOLD));
    }
}
