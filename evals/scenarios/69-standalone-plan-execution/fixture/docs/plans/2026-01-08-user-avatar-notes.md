# Plan: User avatar notes (completed)

## Tasks
- [x] Add `avatar_note` column to `{{%user}}` (migration `M260108000000`).
- [x] Expose the `AvatarNotesInterface` binding in `config/common/di/avatar.php`.

### Execution State
- **Stage:** Finale
- **Status:** COMPLETE
- **Artifacts:**
  - `migrations/M260108000000AddAvatarNote.php` (Migration)
  - `config/common/di/avatar.php` (DI binding)
- **Wiring Gates:**
  - DI binding: PASS
- **Verification:**
  - Syntax / Project Checks: PASS
  - Unit / HTTP Tests: NOT RUN
- **Open Issues:** None
- **Next Stage:** Complete
