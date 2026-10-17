# Studio v2 implementation and rollout

This is a private Windows Vencord userplugin. The pinned Vencord commit, authentication, 50-account admission limit and moderation remain authoritative. All product copy is English.

The accepted feature list covers saved presets, encrypted draft recovery and undo; layer transforms and phases; generated palettes and comparisons; private collections, shared styles and independent matching bundles; three songs and artwork transitions; performance preferences; sortable Studio blocks and small/full scenes; three decorative layers, parallax, hover and built-in textures; activity automation; structured panels, Studio badges, catalog filters, media labels/folders, transparency inspection, PNG export, viewer overrides and exact moderation comparisons.

Every implementation milestone must pass its own tests before enabling its capabilities. The production VM must receive an encrypted consistent backup and a migration/restore rehearsal before rollout. An old application image alone is not a safe database rollback after v2 writes.

Normal/supporter capacity is 5/20 presets and separately 5/20 collections. The 100 MiB/200-file allowance and daily 10-file limit apply to imported files too. Existing over-capacity objects survive role loss. New custom tint colors still require the server-verified supporter entitlement.

Shared uploads require explicit copying consent. Ordinary gallery withdrawal prevents future copies; existing copies remain. Source erasure and security revocation cascade through media provenance. Imported profiles require their own moderation.

The v2 API is authenticated. Legacy v1 reads project the first supported scene; v1 writes must not erase a v2 document. Retention, privacy export, erasure and recovery fences must cover every new reference before public rollout.
