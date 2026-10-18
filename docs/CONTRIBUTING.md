# Contributing to Profile Studio

Profile Studio remains a self-hosted community Vencord userplugin. Contributions should preserve the pinned Vencord version, pairing, access checks, moderation, media quotas and existing profile compatibility. Discuss changes before replacing infrastructure or adding a new dependency.

Code, design, ideas, reproducible bug reports, documentation, testing and operational help can all contribute to the project. Describe the problem, expected behavior and evidence. Use synthetic profiles and remove account identifiers, tokens, private URLs, uploads and diagnostic contents from public reports. Report vulnerabilities privately through the channel specified in [SECURITY.md](SECURITY.md); do not post a working exploit or secret publicly.

## Supporter recognition

Supporter is a lasting, manually awarded acknowledgement of accepted help. The owner alone decides whether a contribution merits the role. There is no payment, automatic score, guaranteed award or minimum code requirement. Design, ideas and other useful help count alongside code. The project does not automatically remove recognition when someone stops contributing; community moderation remains the owner's responsibility.

The existing role enables 20 saved presets and 20 collections instead of five each, and custom HEX tints. Everyone keeps the same 100 MiB media quota and access to the editor features. If the role is removed, existing objects remain; new objects must fit the lower limit. An unchanged, previously approved custom tint may remain, but another custom color requires entitlement again. Studio display badges do not grant this role or any permission.

## Making a change

1. Follow [the developer guide](DEVELOPMENT.md) and reproduce the issue.
2. Keep the change focused, typed and compatible with existing configurations. Shared pure contracts belong in `packages/shared/domain`; server code must not import plugin implementations.
3. Check the dynamic/native entrypoint exceptions before removing apparently unused code. Preserve required licences and corresponding source.
4. Run typechecking, lint, relevant tests and builds. API changes must update the checked route contracts. Changes to auth, quotas, moderation, media ownership or recovery require their regression suites.
5. Explain the behavior, validation and remaining limitations. Browser fixtures do not replace native Windows Discord testing.

Contributions are distributed under the project's GPL-3.0-or-later licence. Do not submit third-party material without compatible permission and attribution. Shop artwork and music are not automatically licensed for redistribution in the project.

## Future updates

Proposals are welcome, but a roadmap entry is not an implementation promise. Scope, behavior, cost and release gates must be discussed before work begins. No new feature is committed merely because it appears in an idea list.
