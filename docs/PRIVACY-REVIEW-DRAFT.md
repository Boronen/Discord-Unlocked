# Deployment privacy notice — operator review draft

Prepared on 18 October 2026. **Draft: not approved for deployment.** This supplements the implemented-data description in [Privacy and your data](PRIVACY.md); it does not turn the API notice into a configured notice. Review the decisions below before copying approved wording into the private deployment configuration.

## Confirmed deployment facts

The operator explicitly supplied **Kovács Kevin** as their name for publication as controller/operator, country **Hungary**, and contact **boronengames.support@gmail.com**. **Discord Unlocked** is the project name. **Boronen Games** is the intended company/brand name; no incorporation or transfer of controller responsibility has been established. The operator confirmed they act as a private individual, the host is physically in Hungary, and only they administer the Windows computer and isolated Linux VM. The VM is exposed through Tailscale Funnel. Encrypted backups are copied to private Google Drive. The operator confirmed personal, free Google Drive and Tailscale Personal accounts; no Google Workspace or business-plan agreement is assumed. The beta admission policy is 18+; the operator controls invitations and beta-role assignment. The software does not automatically verify age or collect birth dates for this policy. These are operator statements; external provider locations and contractual terms have not been verified for the actual accounts.

The application stores Discord account identifiers, sessions, chosen profile content, normalized uploads, presets, private collections, moderation records and the other data listed in the canonical notice. Approved content is visible to paired beta members. Moderators and the operator have the access described there. Current listening activity is read locally; no listening history is stored by the Profile Studio API. Retention, encrypted backup expiry and deletion behavior remain exactly as documented in the canonical notice, rather than a second schedule here.

## Proposed purpose-by-purpose basis

These are proposals for operator assessment, not a finding that a legal basis already exists:

- **Pairing, role checks, drafts and requested profile display:** assess Article 6(1)(b) only if valid service terms establish a contract and each operation is necessary to provide it. Free access alone does not settle that assessment. Otherwise assess a specific alternative before launch.
- **Abuse prevention, moderation, restricted access and recovery:** candidate Article 6(1)(f), subject to a recorded necessity and balancing assessment.
- **Optional gallery sharing and optional content display:** assess whether specific consent is appropriate. An ordinary Save or Submit action is not automatically valid consent. If consent is selected, implement and verify collection, withdrawal and any record needed before claiming it.
- **Rights requests or legally required disclosures:** use Article 6(1)(c) only for an identified applicable legal obligation.

The operator must select and document the actual bases; this draft does not authorize changing bases retroactively. [GDPR Articles 6–7](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679).

For any proposed legitimate interest, record the concrete interest, why each data item is necessary, less intrusive alternatives, user expectations, effects on users, safeguards and the balancing outcome. Include children's interests if children can join. Do not infer an adult-only audience from Discord membership. See the [EDPB lawful-processing guide](https://www.edpb.europa.eu/sme/be-compliant/process-personal-data-lawfully_en).

## Accepted request-handling commitments and remaining review

Send requests to **boronengames.support@gmail.com** or use the authenticated export/deletion controls. Do not send passwords, session tokens or backup keys. The operator explicitly accepted regular monitoring of this mailbox, proportionate account verification and responding without undue delay, normally within one month. Private request-record handling and the detailed workflow still need operational review and rehearsal. For a permitted extension, notify the requester within that month and explain why. Requests may concern access, correction, deletion, restriction, portability or objection where applicable; explain any refusal and available remedies. [EDPB rights guidance](https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en).

A complaint may be submitted to Hungary's **NAIH**, or another competent supervisory authority. Use [NAIH's official submission instructions](https://www.naih.hu/online-ugyinditas); its general email address is not a procedure-initiation channel. Contacting this operator first is not a condition for complaining.

Operational review: the individual operator has accepted responsibility for mailbox monitoring and responses. Rehearse requests after guild departure and session expiry, define the proportionate account-recovery check, and review private request-record retention and access. These commitments do not establish that a rehearsal or final legal assessment has passed. The product's active-storage erasure target is separate from the legal response deadline. Do not promise immediate removal from encrypted backups or from another viewer's downloaded copy.

## Providers and transfers to verify

- **Self-hosted VM:** database and normalized media on the isolated host. The operator confirmed Hungary and sole administrator access. Still verify any Windows/cloud synchronization that could receive data. Do not publish the home address or network addresses in documentation.
- **Tailscale:** Funnel/network service and operator administration. Its [privacy policy](https://tailscale.com/privacy-policy) and [DPA](https://tailscale.com/dpa) describe separate scopes. Verify the terms actually applicable to this account, processing locations and safeguards; this draft does not assert a DPA is executed or covers all traffic.
- **Google Drive:** encrypted backup objects plus provider-visible account/file metadata. Google describes worldwide processing and transfer mechanisms in its [transfer framework notice](https://policies.google.com/privacy/frameworks?hl=en). This does not establish EU-only storage, the operator's specific agreement, or a chosen mechanism for this deployment. Verify those separately. The backup key stays independent of this destination.
- **Discord:** identity/role checks and private bot moderation previews. Its [privacy policy](https://discord.com/privacy) governs Discord's processing. Record applicable terms, destinations, preview-message erasure procedures and recipients; do not label Discord solely as this operator's processor without assessing its role.
- **Music providers/CDNs and Steam:** optional metadata/artwork requests and explicitly opened players, as described in the canonical notice. Record the actual enabled services and applicable policies. Do not claim all provider processing is local because the application database is self-hosted.

## Decisions required before approval

### Public provider terms checked on 18 October 2026

The following findings narrow the remaining review; they do not certify the deployment:

- **Tailscale contract:** the published [DPA, opening provisions](https://tailscale.com/dpa) says it is incorporated into the applicable agreement. The [Terms of Service](https://tailscale.com/terms) expressly address free customers. This supports reviewing the DPA for the confirmed Personal account rather than assuming a paid plan or separately signed document is always necessary. Confirm the account's actual applicable agreement and processing scope. The privacy policy separately covers Tailscale's controller activities.
- **Funnel transport:** [Tailscale's technical documentation](https://tailscale.com/docs/features/tailscale-funnel) states that relay servers forward encrypted traffic, with TLS termination on the device serving the resource. This describes payload transport; it does not eliminate account, connection or operational metadata processing, establish processing regions or replace the contract assessment.
- **Google personal Drive:** Google's [privacy policy](https://policies.google.com/privacy?hl=en) describes worldwide servers and possible processing outside the user's country. Its [transfer notice](https://policies.google.com/privacy/frameworks?hl=en) describes DPF certification and contractual transfer mechanisms. Neither page establishes an EU-only storage choice or a Workspace processing agreement for this personal account. The actual applicable provider relationship and transfer scope remain to be recorded. Encryption and independent key custody reduce exposure; they do not make all backup metadata anonymous.
- **Plan suitability:** [Tailscale's pricing explanation](https://tailscale.com/pricing) describes Personal as non-commercial. Before operating on behalf of a future company or changing the service into a commercial activity, reassess plan eligibility. The planned Boronen Games name alone does not establish a company, commercial operation or a need to upgrade now. No plan change is authorized by this review.

Do not copy a provider's own legal basis into this operator's purpose-specific legal-basis field. Keep the provider-role assessment separate from the bases for running the community.

### Operational request rehearsal

The operator has accepted the mailbox, verification and response commitments above. Complete the following in a test environment using synthetic records before marking the workflow rehearsed:

1. Record receipt time, requested action, a private request reference and response deadline. Keep records outside Git, public issues and release artifacts; define their access and retention before storing real requests.
2. Prefer the existing authenticated export/deletion controls. For an expired session, establish control of the same Discord account using a proportionate recovery check; never request a Discord password, session token or an unrelated identity document by default. Do not disclose another account's records.
3. Exercise export/deletion after beta-role removal and guild departure. Verify the requester can still use a valid session's data-subject routes; membership checks must not silently block those rights controls.
4. For deletion, check immediate access removal, queued active-storage cleanup, private moderation-message cleanup and recovery fences. Distinguish the application cleanup target, backup expiry and the response deadline. Do not claim to erase copies downloaded by viewers.
5. Send a written completion or reasoned response through the verified channel. Explain any permitted extension within the initial month. Provide the complaint route where applicable; archive only the minimal request evidence under the approved retention policy. See [EDPB request-handling guidance](https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en).

No real request has been simulated or sent by this documentation change. The account-recovery check, request-record retention and end-to-end rehearsal remain open.

### Remaining owner decisions

1. Controller name and contact are supplied for publication: Kovács Kevin, Hungary, boronengames.support@gmail.com. Review whether any further controller contact details are required for the actual deployment; none have been invented or inferred.
2. Approve a basis for each purpose, with the necessary terms, consent workflow or balancing record. The operator selected an adults-only beta; document how invitation/role assignment enforces that policy without unnecessary identity documents.
3. Verify actual provider terms, roles, processing regions and transfer arrangements for the accounts used.
4. Request-handling commitments accepted: mailbox monitoring, proportionate account verification and a response normally within one month. Rehearse this workflow and complete the detailed request-record and complaint procedure review; acceptance of these commitments does not approve the entire privacy draft.
5. Compare the wording with actual deployed retention, permissions, backup rotation and erasure behavior. Rehearse the optional API-only notice mount through the update/restart path before enabling it.

Until these decisions are complete, keep `PRIVACY_NOTICE_FILE` unset and the public endpoint's `configured` value false. Do not install a draft or populate placeholders merely to clear a launch check. Keep private evidence and signed assessments outside Git and release ZIPs.
