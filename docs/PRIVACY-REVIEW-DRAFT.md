# Deployment privacy notice — operator review draft

Prepared on 18 October 2026. **Draft: not approved for deployment.** This supplements the implemented-data description in [Privacy and your data](PRIVACY.md); it does not turn the API notice into a configured notice. Review the decisions below before copying approved wording into the private deployment configuration.

## Confirmed deployment facts

The operator explicitly supplied **Kovács Kevin** as their name for publication as controller/operator, country **Hungary**, and contact **alisioboronen@gmail.com**. **Discord Unlocked** is the project name. **Boronen Games** is the intended company/brand name; no incorporation or transfer of controller responsibility has been established. The operator confirmed they act as a private individual, the host is physically in Hungary, and only they administer the Windows computer and isolated Linux VM. The VM is exposed through Tailscale Funnel. Encrypted backups are copied to private Google Drive. The beta admission policy is 18+; the operator controls invitations and beta-role assignment. The software does not automatically verify age or collect birth dates for this policy. These are operator statements; external provider locations and contractual terms have not been verified for the actual accounts.

The application stores Discord account identifiers, sessions, chosen profile content, normalized uploads, presets, private collections, moderation records and the other data listed in the canonical notice. Approved content is visible to paired beta members. Moderators and the operator have the access described there. Current listening activity is read locally; no listening history is stored by the Profile Studio API. Retention, encrypted backup expiry and deletion behavior remain exactly as documented in the canonical notice, rather than a second schedule here.

## Proposed purpose-by-purpose basis

These are proposals for operator assessment, not a finding that a legal basis already exists:

- **Pairing, role checks, drafts and requested profile display:** assess Article 6(1)(b) only if valid service terms establish a contract and each operation is necessary to provide it. Free access alone does not settle that assessment. Otherwise assess a specific alternative before launch.
- **Abuse prevention, moderation, restricted access and recovery:** candidate Article 6(1)(f), subject to a recorded necessity and balancing assessment.
- **Optional gallery sharing and optional content display:** assess whether specific consent is appropriate. An ordinary Save or Submit action is not automatically valid consent. If consent is selected, implement and verify collection, withdrawal and any record needed before claiming it.
- **Rights requests or legally required disclosures:** use Article 6(1)(c) only for an identified applicable legal obligation.

The operator must select and document the actual bases; this draft does not authorize changing bases retroactively. [GDPR Articles 6–7](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679).

For any proposed legitimate interest, record the concrete interest, why each data item is necessary, less intrusive alternatives, user expectations, effects on users, safeguards and the balancing outcome. Include children's interests if children can join. Do not infer an adult-only audience from Discord membership. See the [EDPB lawful-processing guide](https://www.edpb.europa.eu/sme/be-compliant/process-personal-data-lawfully_en).

## Proposed request and complaint process

Send requests to **alisioboronen@gmail.com** or use the authenticated export/deletion controls. Do not send passwords, session tokens or backup keys. The operator would verify account control using proportionate evidence, log the request privately and respond without undue delay, normally within one month. For a permitted extension, notify the requester within that month and explain why. Requests may concern access, correction, deletion, restriction, portability or objection where applicable; explain any refusal and available remedies. [EDPB rights guidance](https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en).

A complaint may be submitted to Hungary's **NAIH**, or another competent supervisory authority. Use [NAIH's official submission instructions](https://www.naih.hu/online-ugyinditas); its general email address is not a procedure-initiation channel. Contacting this operator first is not a condition for complaining.

Operational review: confirm the mailbox is monitored, assign a responsible person, rehearse requests after guild departure and session expiry, and define a proportionate account-recovery check. The product's active-storage erasure target is separate from the legal response deadline. Do not promise immediate removal from encrypted backups or from another viewer's downloaded copy.

## Providers and transfers to verify

- **Self-hosted VM:** database and normalized media on the isolated host. The operator confirmed Hungary and sole administrator access. Still verify any Windows/cloud synchronization that could receive data. Do not publish the home address or network addresses in documentation.
- **Tailscale:** Funnel/network service and operator administration. Its [privacy policy](https://tailscale.com/privacy-policy) and [DPA](https://tailscale.com/dpa) describe separate scopes. Verify the terms actually applicable to this account, processing locations and safeguards; this draft does not assert a DPA is executed or covers all traffic.
- **Google Drive:** encrypted backup objects plus provider-visible account/file metadata. Google describes worldwide processing and transfer mechanisms in its [transfer framework notice](https://policies.google.com/privacy/frameworks?hl=en). This does not establish EU-only storage, the operator's specific agreement, or a chosen mechanism for this deployment. Verify those separately. The backup key stays independent of this destination.
- **Discord:** identity/role checks and private bot moderation previews. Its [privacy policy](https://discord.com/privacy) governs Discord's processing. Record applicable terms, destinations, preview-message erasure procedures and recipients; do not label Discord solely as this operator's processor without assessing its role.
- **Music providers/CDNs and Steam:** optional metadata/artwork requests and explicitly opened players, as described in the canonical notice. Record the actual enabled services and applicable policies. Do not claim all provider processing is local because the application database is self-hosted.

## Decisions required before approval

1. Controller name and contact are supplied for publication: Kovács Kevin, Hungary, alisioboronen@gmail.com. Review whether any further controller contact details are required for the actual deployment; none have been invented or inferred.
2. Approve a basis for each purpose, with the necessary terms, consent workflow or balancing record. The operator selected an adults-only beta; document how invitation/role assignment enforces that policy without unnecessary identity documents.
3. Verify actual provider terms, roles, processing regions and transfer arrangements for the accounts used.
4. Approve and rehearse the request, identity-verification and complaint process.
5. Compare the wording with actual deployed retention, permissions, backup rotation and erasure behavior. Rehearse the optional API-only notice mount through the update/restart path before enabling it.

Until these decisions are complete, keep `PRIVACY_NOTICE_FILE` unset and the public endpoint's `configured` value false. Do not install a draft or populate placeholders merely to clear a launch check. Keep private evidence and signed assessments outside Git and release ZIPs.
