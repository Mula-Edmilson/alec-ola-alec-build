// Exercise the actual pinned native Windows modifier-tap state machine.
#[path = "../../upstream/showcase/tauri/src-tauri/src/tap.rs"]
mod tap;
#[test]
fn ctrl_shift_opens_once_and_does_not_steal_other_shortcuts() {
    let pair = tap::CONTROL | tap::SHIFT;
    let mut t = tap::Tap::new();
    assert!(!t.step(pair, tap::CONTROL, || false, 0));
    assert!(!t.step(pair, pair, || false, 50));
    assert!(!t.step(pair, tap::SHIFT, || false, 100));
    assert!(t.step(pair, 0, || false, 125));
    assert!(!t.step(pair, 0, || false, 130));
    assert!(!t.step(pair, pair, || false, 200));
    assert!(!t.step(pair, pair, || true, 250));
    assert!(!t.step(pair, 0, || false, 300));
    assert!(!t.step(pair, pair, || false, 350));
    assert!(t.step(pair, 0, || false, 400));
}
