/**
 * Canonical signup agreement metadata and copy.
 *
 * IMPORTANT: Any substantive copy change must ship with a new
 * PRISM_EULA_VERSION. The content hash is pinned by legal.test.ts so the API
 * can retain evidence of the exact text accepted during account creation.
 */
export const PRISM_EULA_DOCUMENT_ID = "prism-eula";
export const PRISM_EULA_VERSION = "2026-07-19";
export const PRISM_EULA_EFFECTIVE_DATE = "July 19, 2026";
export const PRISM_EULA_MINIMUM_AGE = 18;
export const PRISM_EULA_TITLE = "End User License Agreement and AI Notice";
export const PRISM_EULA_MINIMUM_AGE_CONFIRMATION =
  `I confirm that I am at least ${PRISM_EULA_MINIMUM_AGE} years old.`;
export const PRISM_EULA_AGREEMENT_CONFIRMATION =
  "I have read and agree to the End User License Agreement and AI Notice.";
export const PRISM_EULA_ACCEPTANCE_ACTION = "Agree & create account";

export const PRISM_EULA_LEGAL_CONTACT_URL =
  "https://github.com/AureliusSoftworks/LocalAI";

export const PRISM_MODEL_VARIABILITY_NOTICE =
  "Results vary by model. Quality, accuracy, tone, speed, memory behavior, safety behavior, and cost can differ by model, provider, version, settings, context, and chance—even with the same prompt. Every PRISM experience will be different, so verify important output.";

export const PRISM_EULA_KEY_POINTS = [
  "PRISM characters are AI simulations, not people or professional advisers.",
  PRISM_MODEL_VARIABILITY_NOTICE,
  "LOCAL and ONLINE use different data paths. ONLINE and connected features may send selected content to third-party providers.",
  "PRISM is not an emergency or crisis service. Verify important output before relying on, publishing, or acting on it.",
] as const;

export const PRISM_EULA_MARKDOWN = `
This End User License Agreement and AI Notice (the **Agreement**) is a binding agreement between you and the person or legal entity identified as the publisher of the official PRISM build you obtained (the **Licensor**, **we**, **us**, or **our**). It governs the official PRISM software, applications, updates, documentation, and related features (collectively, the **Software**).

By affirmatively checking the agreement box and selecting **Agree & create account**, you confirm that you have read and agree to this Agreement. If you do not agree, do not create an account or use the Software. If you accept for an organization, you represent that you have authority to bind it.

## 1. Eligibility

You must be at least ${PRISM_EULA_MINIMUM_AGE} years old and legally able to enter this Agreement. You may not use the Software where doing so is prohibited by law.

## 2. License

Subject to this Agreement, Licensor grants you a limited, non-exclusive, non-transferable, revocable license to install and use official PRISM builds for personal and internal business purposes. The Software is licensed, not sold, and Licensor and its licensors retain all rights not expressly granted.

Some libraries, models, assets, source files, and other third-party or open-source components are governed by separate licenses. Those licenses control to the extent they grant rights this Agreement cannot restrict.

Unless applicable law or a separate controlling license permits it, you may not:

- sell, rent, sublicense, or commercially redistribute official PRISM builds;
- remove copyright, trademark, attribution, or proprietary notices;
- use PRISM branding in a way that suggests an unofficial fork, service, or product is endorsed by Licensor;
- bypass security, access, privacy, rate-limit, or safety controls; or
- use the Software to operate an unauthorized competing hosted service.

## 3. Accounts, devices, and self-hosting

A PRISM account generally belongs to the PRISM Server on which it was created. It is not necessarily a cloud account operated by Licensor.

You are responsible for protecting your username, password, API keys, devices, server, and backups; controlling who can reach your server, including over a local network; installing appropriate security updates; and activity performed through access you authorize.

The owner or administrator of a PRISM Server may be technically able to access, manage, back up, or delete accounts and content stored on that server. Do not create an account on a server you do not trust.

## 4. AI identity, limitations, and model variability

PRISM lets you interact with artificial-intelligence models and AI-generated characters. These characters are software, not human beings. Names, personalities, voices, memories, emotions, relationships, or expressions of concern are generated simulations. They do not establish consciousness, human feelings, professional qualifications, consent, authority, endorsement, or a duty to you.

AI output is probabilistic. It may be inaccurate, incomplete, outdated, biased, offensive, inconsistent, misleading, fabricated, or inappropriate.

**${PRISM_MODEL_VARIABILITY_NOTICE}**

You are responsible for reviewing output for accuracy, safety, legality, and suitability before relying on, publishing, sharing, or acting on it. Output does not necessarily represent Licensor's views.

## 5. No professional, safety, or emergency service

PRISM is not an emergency or crisis service. It is a general-purpose creative and conversational tool, not a doctor, therapist, lawyer, financial adviser, emergency responder, or monitoring service.

Do not use PRISM as the sole source for medical, mental-health, legal, financial, safety, employment, housing, education, credit, insurance, benefits, law-enforcement, or other consequential decisions. Obtain qualified human advice and independently verify material information.

If you or another person may be in immediate danger, contact local emergency services or an appropriate crisis service. Do not wait for or rely on an AI response.

## 6. LOCAL, ONLINE, and third-party providers

PRISM can use local and online providers.

- **LOCAL** turns are designed to route model processing through services configured on your device or local network. You remain responsible for the security and behavior of those devices, services, models, and networks.
- **ONLINE** and optional connected features may transmit prompts, conversation context, files, images, audio, voice information, search requests, or other selected content to an external provider.

Your use of OpenAI, Anthropic, ElevenLabs, Ollama models, search services, image services, or another provider is also governed by that provider's current terms, privacy practices, licenses, usage rules, pricing, and technical limits. You are responsible for required provider accounts, permissions, API keys, and charges.

Licensor does not control and is not responsible for a provider's availability, output, moderation, model changes, retention practices, security, charges, or discontinuation. Provider functionality may change or stop working without a PRISM update.

## 7. Your content and AI output

You retain any rights you have in prompts, uploads, conversations, bot configurations, images, audio, and other material you provide (**Input**).

You represent that you have the rights and permissions needed to provide Input and authorize its requested processing, including rights involving copyright, privacy, publicity, voice, likeness, confidential information, and personal data.

You authorize the Software and your selected providers to reproduce, process, store, and transmit Input only as needed to provide the functionality you request, protect the Software and its users, support you at your request, and comply with law. External providers receive any additional rights described in their own terms.

You are responsible for how you use AI-generated output. Output may resemble existing material or output provided to other people. Licensor does not promise that output is unique, accurate, non-infringing, eligible for intellectual-property protection, or owned by you.

## 8. Prohibited uses

You may not use PRISM to:

- violate law or another person's rights;
- create, solicit, distribute, or facilitate child sexual-abuse material or sexual exploitation of minors;
- facilitate suicide, self-harm, violence, terrorism, trafficking, or illegal weapons activity;
- create malware, gain unauthorized access, disrupt systems, or evade safeguards;
- harass, threaten, stalk, dox, defraud, or unlawfully surveil another person;
- impersonate a real person, clone a voice, or use a person's likeness without required authorization and disclosure;
- deceptively represent AI-generated material as human-generated;
- make consequential decisions about another person without legally required safeguards, qualified human review, and independent verification; or
- bypass provider policies, model licenses, content controls, rate limits, or safety systems.

Safety features are imperfect. Their presence does not make prohibited or dangerous use permissible.

## 9. Privacy and security

PRISM is local-first, but local-first does not mean risk-free. Content may be exposed through an insecure device, compromised credentials, server administration, network configuration, backups, logs, third-party software, or an online provider you choose.

No system is perfectly secure. Licensor does not guarantee that content will never be accessed, lost, corrupted, or disclosed. Do not submit regulated, highly sensitive, or mission-critical data unless you have independently determined that your configuration and providers meet your legal and security requirements.

PRISM is not represented as compliant with HIPAA, financial-services security rules, educational-record rules, or other sector-specific requirements unless Licensor expressly states otherwise in a signed agreement.

## 10. PRISM intellectual property and feedback

Except for your content and third-party materials, the Software, official builds, documentation, visual identity, names, logos, and other PRISM materials are owned by Licensor or its licensors and protected by applicable law.

If you voluntarily provide feedback, you grant Licensor a worldwide, perpetual, irrevocable, non-exclusive, royalty-free license to use it without restriction or compensation. Feedback does not include private conversations or other user content merely because it is stored in PRISM.

## 11. Changes, updates, and availability

Licensor may add, change, suspend, or discontinue Software features, models, integrations, or support. Licensor does not promise perpetual compatibility with any operating system, model, provider, or third-party service.

Updates may be required for security, legal compliance, provider compatibility, or continued operation. You remain responsible for exporting or backing up data you wish to preserve.

If you obtained PRISM through Steam or another store, that store's terms govern storefront matters such as downloading, payment, and refunds. This Agreement governs your use of PRISM.

## 12. Termination

You may terminate this Agreement at any time by stopping use and uninstalling official PRISM builds.

Your license terminates if you materially breach this Agreement and do not cure the breach where law requires an opportunity to cure. Upon termination, you must stop using official builds, except where a controlling third-party or open-source license independently permits continued use.

Termination does not automatically delete locally stored data, backups, provider accounts, or provider content. Sections that by their nature should survive—including ownership, disclaimers, liability limits, indemnity, and dispute terms—will survive.

## 13. Warranty disclaimer

**TO THE FULLEST EXTENT PERMITTED BY LAW, THE SOFTWARE AND ALL AI OUTPUT ARE PROVIDED “AS IS” AND “AS AVAILABLE.” LICENSOR DISCLAIMS ALL EXPRESS, IMPLIED, AND STATUTORY WARRANTIES, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, ACCURACY, AVAILABILITY, SECURITY, AND QUIET ENJOYMENT.**

**LICENSOR DOES NOT WARRANT THAT PRISM OR ANY MODEL, PROVIDER, SAFETY FEATURE, OR OUTPUT WILL BE ACCURATE, SAFE, UNINTERRUPTED, ERROR-FREE, SECURE, OR SUITABLE FOR YOUR PURPOSE.**

This section does not limit non-waivable consumer guarantees or other rights under applicable law.

## 14. Limitation of liability

**TO THE FULLEST EXTENT PERMITTED BY LAW, LICENSOR AND ITS OWNERS, AFFILIATES, CONTRIBUTORS, AND LICENSORS WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, REVENUE, DATA, GOODWILL, BUSINESS OPPORTUNITY, OR COST OF SUBSTITUTE SERVICES, ARISING FROM OR RELATING TO THE SOFTWARE, PROVIDERS, CONTENT, OR OUTPUT.**

**TO THE FULLEST EXTENT PERMITTED BY LAW, LICENSOR'S TOTAL LIABILITY FOR ALL CLAIMS ARISING FROM OR RELATING TO THE SOFTWARE OR THIS AGREEMENT WILL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID DIRECTLY TO LICENSOR FOR PRISM DURING THE 12 MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM OR (B) US$100.**

These limits apply regardless of legal theory and even if a remedy fails of its essential purpose. Nothing in this Agreement excludes or limits liability that cannot lawfully be excluded or limited, including liability protected by applicable consumer or AI-companion law, or liability for fraud, willful misconduct, or death or personal injury where exclusion is prohibited.

## 15. Indemnity

To the extent permitted by law, you will defend and indemnify Licensor against third-party claims, damages, and reasonable costs resulting from your unlawful use of PRISM, your Input, your infringement of another person's rights, or your intentional material breach of this Agreement.

This obligation does not apply to the extent a claim results from Licensor's negligence, willful misconduct, or violation of law. Licensor will promptly notify you and reasonably cooperate. You may not settle a claim in a way that admits Licensor's fault or imposes obligations on Licensor without written consent.

## 16. Governing law and disputes

This Agreement is governed by the laws of the jurisdiction where Licensor's principal place of business is located, excluding conflict-of-law rules. Any dispute must be brought in the courts serving that location, except where mandatory consumer law allows you to bring a claim elsewhere.

Before filing a claim, each party agrees to send written notice describing the dispute and allow 30 days for a good-faith informal resolution. Nothing in this section limits rights that cannot be waived under the law where you live.

## 17. Changes to this Agreement

Licensor may update this Agreement prospectively for legal, security, product, or technical reasons. The updated version governs accounts created after its effective date. For an existing account, the version you accepted continues to govern unless you affirmatively accept a revised Agreement or applicable law provides otherwise.

Licensor may provide reasonable in-product notice of a revised Agreement. The effective date and version appear with the Agreement. A revised Agreement will not retroactively change disputes that arose before acceptance unless law permits and the revised text expressly says so.

## 18. General terms

This Agreement and any terms expressly incorporated by reference form the agreement governing your use of PRISM. If a provision is unenforceable, it will be narrowed only as much as necessary, and the remainder will remain effective. Failure to enforce a provision is not a waiver.

You may not assign this Agreement without Licensor's consent. Licensor may assign it as part of a merger, reorganization, asset transfer, or change of control.

## 19. Contact

Legal notices and questions may be submitted through the official PRISM repository at ${PRISM_EULA_LEGAL_CONTACT_URL}, unless the official download page or store listing provides a more specific legal contact. The publisher identity and any additional contact information shown on that official distribution page are incorporated into this Agreement.
`.trim();

/**
 * Immutable, self-contained evidence package stored with each signup
 * acceptance. It includes every substantive element presented in the
 * clickwrap, not only the long-form Markdown.
 */
export const PRISM_EULA_ACCEPTANCE_SNAPSHOT = [
  PRISM_EULA_TITLE,
  `Effective ${PRISM_EULA_EFFECTIVE_DATE}`,
  `Version ${PRISM_EULA_VERSION}`,
  "",
  "Key terms",
  ...PRISM_EULA_KEY_POINTS.map((point) => `- ${point}`),
  "",
  PRISM_EULA_MARKDOWN,
  "",
  "Acceptance confirmations",
  `- ${PRISM_EULA_MINIMUM_AGE_CONFIRMATION}`,
  `- ${PRISM_EULA_AGREEMENT_CONFIRMATION}`,
  `Action: ${PRISM_EULA_ACCEPTANCE_ACTION}`,
].join("\n");

export const PRISM_EULA_CONTENT_SHA256 =
  "f5c481ccb3d50096be3434c813ac97d678407903058327885d9c5c6ae5547a37";

export interface PrismSignupLegalAcceptance {
  eulaAccepted: true;
  eulaVersion: typeof PRISM_EULA_VERSION;
  minimumAgeConfirmed: true;
}
