// src/play/undo.ts
// Inverse records per park command, grouped by stroke, 10 deep (03 5.6).
// Ported from GV 11086-11116 (undo stack, beginStroke, showUndo) in S3. ADAPT.
// TODO(S3): fills this file; S0 holds only the header and a placeholder export.

export const SLICE = 'S3' as const;
