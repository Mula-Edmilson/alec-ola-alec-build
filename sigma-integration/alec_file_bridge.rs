// SPDX-License-Identifier: GPL-3.0-or-later
// Optional, read-only loopback bridge for Sigma File Manager 2.3.0.
use crate::global_search::{self, GlobalSearchQueryOptions};
use axum::{extract::{DefaultBodyLimit, State}, http::{HeaderMap, StatusCode}, response::{IntoResponse, Response}, routing::post, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{path::{Path, PathBuf}, sync::Arc};
#[derive(Clone)]
struct Bridge { app: tauri::AppHandle, token: Arc<str>, roots: Arc<Vec<PathBuf>> }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request { operation: String, query: Option<String>, path: Option<String>, limit: Option<usize> }
fn allowed(roots: &[PathBuf], path: &Path) -> Option<PathBuf> {
    if !path.is_absolute() { return None; }
    let resolved = dunce::canonicalize(path).ok()?;
    roots.iter().any(|root| resolved.starts_with(root)).then_some(resolved)
}
fn authenticated(headers: &HeaderMap, token: &str) -> bool {
    let expected = format!("Bearer {token}");
    let supplied = headers.get("authorization").and_then(|v| v.to_str().ok()).unwrap_or("");
    supplied.len() == expected.len() && supplied.bytes().zip(expected.bytes()).fold(0u8, |acc,(a,b)| acc | (a ^ b)) == 0
}
fn error(code: StatusCode, message: &str) -> Response { (code, Json(json!({"error": message}))).into_response() }
fn ok(value: Value) -> Response { Json(json!({"provider":"sigma", "data":value})).into_response() }
async fn handle(State(state): State<Bridge>, headers: HeaderMap, Json(req): Json<Request>) -> Response {
    if !authenticated(&headers, &state.token) { return error(StatusCode::UNAUTHORIZED,"Unauthorized"); }
    if headers.contains_key("origin") { return error(StatusCode::FORBIDDEN,"Browser origins not allowed"); }
    let limit = req.limit.unwrap_or(30);
    if !(1..=100).contains(&limit) { return error(StatusCode::BAD_REQUEST,"Invalid limit"); }
    match req.operation.as_str() {
        "status" => match global_search::global_search_get_status() {
            Ok(s) => ok(json!({"indexReady":s.is_index_valid,"scanning":s.is_scan_in_progress})),
            Err(_) => error(StatusCode::SERVICE_UNAVAILABLE,"Search index unavailable"),
        },
        "search" => {
            let query = req.query.unwrap_or_default();
            if query.trim().is_empty() || query.len() > 512 { return error(StatusCode::BAD_REQUEST,"Invalid query"); }
            match global_search::global_search_get_status() {
                Ok(s) if s.is_index_valid => (),
                _ => return error(StatusCode::SERVICE_UNAVAILABLE,"Index not ready; build it in Sigma first"),
            }
            let options = GlobalSearchQueryOptions { limit: limit.saturating_mul(5).min(500), include_files:true, include_directories:true, exact_match:false, typo_tolerance:true, min_score_threshold:None };
            match global_search::global_search_query(state.app.clone(),query,options).await {
                Ok(entries) => {
                    let roots = state.roots.clone();
                    match tauri::async_runtime::spawn_blocking(move || {
                        let mut filtered = Vec::new();
                        for entry in entries {
                            if let Some(path) = allowed(&roots,Path::new(&entry.path)) {
                                filtered.push(json!({"name":entry.name,"path":path.to_string_lossy(),"size":entry.size,"modifiedTime":entry.modified_time,"mime":entry.mime,"isDirectory":entry.is_dir,"score":entry.score}));
                                if filtered.len() >= limit { break; }
                            }
                        }
                        filtered
                    }).await { Ok(items) => ok(json!({"items":items,"scopeFiltered":true,"exhaustive":false})), Err(_) => error(StatusCode::INTERNAL_SERVER_ERROR,"Search failed") }
                },
                Err(_) => error(StatusCode::SERVICE_UNAVAILABLE,"Search unavailable"),
            }
        },
        "list" => {
            let roots = state.roots.clone();
            let path = req.path.unwrap_or_default();
            if path.len()>4096 { return error(StatusCode::BAD_REQUEST,"Invalid path"); }
            match tauri::async_runtime::spawn_blocking(move || -> Result<Value, StatusCode> {
                let path = allowed(&roots,Path::new(&path)).ok_or(StatusCode::FORBIDDEN)?;
                let dir = std::fs::read_dir(&path).map_err(|_| StatusCode::BAD_REQUEST)?;
                let mut items = Vec::new();
                let mut truncated = false;
                for (i, entry) in dir.enumerate() {
                    if i >= 10000 { truncated = true; break; }
                    let Ok(entry) = entry else { continue; };
                    let Some(resolved) = allowed(&roots,&entry.path()) else { continue; };
                    let Ok(meta) = std::fs::metadata(&resolved) else { continue; };
                    if items.len() == limit { truncated = true; break; }
                    let modified_time = meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64);
                    items.push(json!({"name":entry.file_name().to_string_lossy(),"path":resolved.to_string_lossy(),"isDirectory":meta.is_dir(),"size":if meta.is_file(){Some(meta.len())}else{None},"modifiedTime":modified_time}));
                }
                Ok(json!({"path":path.to_string_lossy(),"items":items,"truncated":truncated}))
            }).await {
                Ok(Ok(value)) => ok(value), Ok(Err(code)) => error(code,"Directory unavailable or not authorized"), Err(_) => error(StatusCode::INTERNAL_SERVER_ERROR,"Listing failed"),
            }
        },
        _ => error(StatusCode::BAD_REQUEST,"Unsupported operation"),
    }
}
pub fn start(app: tauri::AppHandle) {
    if std::env::var("ALEC_SIGMA_ENABLE").as_deref() != Ok("1") { return; }
    let Ok(token) = std::env::var("ALEC_SIGMA_TOKEN") else { log::warn!("ALEC bridge disabled: no token"); return; };
    if token.len()!=64 || !token.bytes().all(|b| b.is_ascii_hexdigit()) { log::warn!("ALEC bridge disabled: invalid token"); return; }
    let Ok(raw_roots) = std::env::var("ALEC_SIGMA_ROOTS") else { return; };
    let Ok(paths) = serde_json::from_str::<Vec<String>>(&raw_roots) else { return; };
    if paths.is_empty() || paths.len()>32 { return; }
    let roots: Vec<_> = paths.iter().filter(|p| Path::new(p).is_absolute()).filter_map(|p| dunce::canonicalize(p).ok()).filter(|p| p.is_dir() && p.parent().is_some()).collect();
    if roots.len()!=paths.len() { log::warn!("ALEC bridge disabled: invalid authorized roots"); return; }
    let state = Bridge { app, token: Arc::from(token), roots: Arc::new(roots) };
    tauri::async_runtime::spawn(async move {
        let router = Router::new().route("/v1/files",post(handle)).layer(DefaultBodyLimit::max(8192)).with_state(state);
        match tokio::net::TcpListener::bind("127.0.0.1:47821").await {
            Ok(listener) => { log::info!("ALEC local read-only bridge listening"); if let Err(e) = axum::serve(listener,router).await { log::warn!("ALEC bridge stopped: {e}"); } },
            Err(e) => log::warn!("ALEC bridge unavailable: {e}"),
        }
    });
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bearer_is_required() {
        let mut headers = HeaderMap::new();
        assert!(!authenticated(&headers, "test"));
        headers.insert("authorization", "Bearer wrong".parse().unwrap());
        assert!(!authenticated(&headers, "test"));
        headers.insert("authorization", "Bearer test".parse().unwrap());
        assert!(authenticated(&headers, "test"));
    }
    #[test]
    fn roots_reject_sibling_and_relative_path() {
        let tmp = tempfile::tempdir().unwrap();
        let root=tmp.path().join("project"); let sibling=tmp.path().join("project-private");
        std::fs::create_dir(&root).unwrap(); std::fs::create_dir(&sibling).unwrap();
        let file=root.join("example.txt"); std::fs::write(&file,b"x").unwrap();
        let roots=vec![dunce::canonicalize(&root).unwrap()];
        assert!(allowed(&roots,&file).is_some());
        assert!(allowed(&roots,&sibling).is_none());
        assert!(allowed(&roots,Path::new("example.txt")).is_none());
    }
}
