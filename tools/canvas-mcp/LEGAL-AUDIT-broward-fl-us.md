# Legal audit: canvas-mcp for Broward County Public Schools (Florida, U.S.)

> **Date:** 2026-09-22. **Audits:** canvas-mcp 2.0.0 (branch `claude/peaceful-darwin-1v1nfs`).
> **Not legal advice.** This maps the tool against the laws, rules and district policies that research turned up. The people who decide are the BCPS privacy/records staff and counsel.
> **How it was researched:** three independent passes (federal, Florida, BCPS plus certifications). The sandbox's network proxy blocked direct reads of ecfr.gov, flsenate.gov, flrules.org, fldoe.org, browardschools.com and sdpc.a4l.org, so most statute and policy wording below comes from search-engine extracts of those primary pages. Anthropic's pages were read directly. **Before relying on any quoted text, open the source** (§8 lists what is unverified).

---

## 1. Verdict

**As things stand, using this tool on real BCPS student data is very likely not permitted, and the tool's privacy features don't change that.** The labels (`P3-07`) reduce exposure. They don't turn the data into something the law stops caring about.

1. **It's still FERPA data.** Grades, submissions, posts and messages are education records. Under 34 CFR 99.3, PII includes anything "linked or linkable" that would let "a reasonable person in the school community" identify a student. Essays and posts in a single class section usually are. De-identification under 99.31(b)(1) needs a reasonable determination that no one is identifiable. Dictionary scrubbing of free text can't support that determination, and PTAC treats linked pseudonymized microdata as re-identifiable.
2. **So sending it to an AI provider is a disclosure,** and it needs an exception. The one that fits is the **school-official exception** (99.31(a)(1)(i)(B)): the provider performs an institutional service, is under the district's **direct control**, and is bound by 99.33(a) use and redisclosure limits. Fla. Stat. 1002.221 imports the same rule: no release without consent "except in accordance with and as permitted by" FERPA. **A teacher can't create that relationship alone.** A district agreement does.
3. **Broward only allows approved tools.** Its AI hub (browardschools.ai, launched Aug 7, 2026, marked "working draft") lists approved tools: Copilot inside the district's Microsoft tenant, MagicSchool, Khanmigo, Writable, Prisms VR. Tools join the list after a DPA, a FERPA check, an independent privacy rating, a security audit and WCAG 2.1 AA testing. Claude/Anthropic is not listed. Policy 5306 (being renumbered 8500) prohibits "installation of unauthorized software". FAC 6A-1.0955 requires boards to review online services before use.
4. **Anthropic says the same.** Claude for Teachers' help center: on an individual account "without school or district authorization … don't include identifiable student information." Consumer plans (Free/Pro/Max, Claude Code on them) are 18+, may train on chats unless you opt out, and keep data up to 5 years. They can't satisfy 99.33(a).

**What would make it permissible:** BCPS approves the tool (or at least the data flow), *and* the AI side runs under an agreement that makes Anthropic a school official. As of Aug 28, 2026 Anthropic offers exactly that: **Claude for Teachers' district offering with the K-12 DPA plus a Public Sector Addendum.** The DPA names Anthropic a FERPA school official under the customer's direct control, with 48-hour breach notice, deletion within 30 days of termination, subprocessor notice, and no targeted ads or profiling. Until both are in place, use the tool only on a sandbox course with synthetic students.

---

## 2. Scope

| | |
|---|---|
| **What the tool does** | Runs on the teacher's machine; reads Canvas with the teacher's personal access token; returns results to an AI assistant (Claude Code/Desktop over stdio, or claude.ai through a tunnel). |
| **What reaches the AI** | Course content, grades, submissions, posts, messages. Students appear as `P<period>-<nn>` labels, and roster names, emails and login/SIS ids are scrubbed from text. |
| **What stays local** | HMAC key, label crosswalk (HMAC to label, no ids or names), audit log (no names), private downloads, and the terminal-only `privacy roster`. |
| **Two scenarios** | **A:** a BCPS teacher using it on their own classes (today). **B:** offering it to districts as a product (later). The obligations differ; both are covered. |

---

## 3. Requirements matrix

Status key: **Met** = the code does it. **Partly** = helps but doesn't satisfy it alone. **Deployment** = not a code problem; needs an agreement, approval or setting. **Gap** = code change recommended (§4).

### Federal

| Requirement | Source | Applies to | Status | Notes |
|---|---|---|---|---|
| Disclose education-record PII only with consent or an exception | FERPA 20 USC 1232g; 34 CFR 99.30, 99.31 | A, B | **Deployment** | Needs the school-official route: district approval plus a K-12 DPA with the AI provider. Labels don't avoid it. |
| School official: institutional service, direct control, 99.33(a) use limits | 34 CFR 99.31(a)(1)(i)(B), 99.33(a) | A, B | **Deployment** | Consumer Claude plans fail this; the Claude for Teachers district offering / K-12 DPA is designed to meet it. |
| De-identification only after a reasonable determination of non-identifiability | 34 CFR 99.31(b)(1) | A, B | **Partly** | Labels, keyed HMAC and scrubbing reduce risk. Free text and small sections keep it PII. The README already says "pseudonymization, not de-identification". |
| Re-identification code must be random, and the key never disclosed | 34 CFR 99.31(b)(2) (research only) | A, B | **Met (by design)** | Labels are random, and the key and crosswalk stay local. Note (b)(2) is a research provision, so this is good practice, not a legal basis. |
| Record disclosures | 34 CFR 99.32 | A, B | **Partly** | The local audit log records tool, course and labels. Disclosures to school officials are exempt from 99.32 logging (sub-cite unverified). |
| IEP/504/accommodation confidentiality | IDEA 34 CFR 300.610–627 (consent 300.622, safeguards 300.623); 504 records under FERPA | A, B | **Gap** | Nothing suppresses accommodation data (extended-time overrides, IEP notes in comments). See §4.3. |
| Children's data, AI training, retention, security program | COPPA 16 CFR 312 (2025 amendments: effective Jun 23 2025, compliance Apr 22 2026) | B (operators) | **Deployment** | The teacher isn't an operator, and Anthropic's services are 18+. For a product: separate parental consent for any third-party disclosure for AI training (never "integral"), a written security program (312.8), and a retention policy (312.10). School consent is allowed only for an authorized educational purpose, and should come from the district, not a teacher. |
| No deceptive privacy claims | FTC Act §5 (Illuminate final order Jun 2026; Edmodo 2023) | B | **Partly** | No certification exists, so never say "FERPA compliant". The README follows this; the `/canvas` site copy still needs a pass. |
| Web content posted to students meets WCAG 2.1 AA | ADA Title II, 28 CFR 35.200–205 | A, B | **Partly** | Anything the tool posts to Canvas (pages, announcements, feedback) is district web content. The deadline for Broward (population ≥ 50k) moved to **Apr 26, 2027** (DOJ interim final rule, Apr 20 2026; final status unverified). There's no course-content exception. The accessibility tools help; for B, publish a VPAT/ACR. |
| PPRA | 20 USC 1232h | — | n/a | Only if the tool were used to survey students on protected topics or for marketing. |

### Florida

| Requirement | Source | Applies to | Status | Notes |
|---|---|---|---|---|
| Education records confidential; release only as FERPA permits | Fla. Stat. 1002.22, 1002.221 | A, B | **Deployment** | The same school-official route. 1002.22 gives a direct circuit-court remedy. |
| Don't collect political or religious affiliation, voting history, or biometrics (fingerprint, iris/retina, voice print, facial geometry); limit SSN use | Fla. Stat. 1002.222; Parents' Bill of Rights 1014.04 (written consent for biometric scans) | A, B | **Gap (partly)** | The tool doesn't analyse media, but nothing stops sending audio/video submissions or text naming religion. See §4.4. |
| Operator duties: no targeted ads, profiling, sale; security; delete at course end or within 90 days after withdrawal | Fla. Stat. 1006.1494 (SB 662, eff. Jul 1 2023); FAC 6A-1.09550 | B (maybe A) | **Deployment** | A locally run personal tool probably isn't an "operator". A product marketed to K-12 squarely is. Onward terms with the AI provider (no training, zero or low retention) are needed. |
| District review of online services before use | FAC 6A-1.0955 (amended, eff. Nov 22 2022) | A, B | **Deployment** | BCPS's "District Software Data Collection Team" and the AI hub review. |
| AI rule: no selling, monetizing or profiling student data, and no training commercial models; public approved-tool list; parent notice; opt-in and non-AI alternative for student-facing AI | FAC 6A-1.0957 amendment (adopted by the State Board Sep 16 2026; district policies due Jul 1 2027) | A, B | **Deployment** | Reported to exclude tools that "do not interact with students and are used to analyze existing data". A teacher-side assistant may fall there, but the data terms and the approved-list model still apply. **Final text not yet read.** |
| Breach: reasonable security; notice to individuals within 30 days; Attorney General if ≥ 500; third-party agent tells the entity within 10 days | Fla. Stat. 501.171 | A, B | **Partly** | Pseudonymized coursework is mostly outside 501.171's "personal information", but the key, crosswalk and roster CSV plus health or IEP content could qualify. For B: 10-day agent notice. See §4.6. |
| Public records and retention | Ch. 119; 1002.221 (exempt ≠ not a record); GS7 (2023), GS1-SL items #393/#394 (audit trails) | A | **Gap (policy)** | A teacher's audit log and crosswalk made in official duties are likely public records (exempt from disclosure but subject to retention). The tool never auto-deletes them, which is good. But `privacy purge --crosswalk` and any future log rotation should wait on the records custodian. See §4.1. |
| Digital Bill of Rights | Fla. Stat. 501.701 et seq. | — | n/a | Thresholds ($1B+) and FERPA and political-subdivision exemptions put the teacher, district and a small vendor outside it. |
| Local-government cybersecurity reporting | Fla. Stat. 282.3185 | ? | **Unverified** | Defines "local government" as a county or municipality. Check whether school districts were added. |

### Broward County Public Schools

| Requirement | Source | Status | Notes |
|---|---|---|---|
| Student records and directory opt-out | Policy 5100.1 (FERPA opt-out form yearly to principal) | **Deployment** | Grades and posts aren't directory info, so opt-outs don't change the analysis, but they matter if names were ever shown. |
| No unauthorized software | Policy 5306 (renumbering to 8500, notice Mar 6 2026) | **Deployment** | The tool is unapproved software on its face. |
| Approved-tools-only AI; student info stays under district control; AI must not grade or decide independently | browardschools.ai (Aug 2026, "working draft"); Copilot staff rollout Jun 2025 | **Deployment / Partly** | Nothing in the tool grades by itself: every write needs the teacher's `confirm=true`. That fits "no independent grading" but needs saying in the review. |
| Vendor vetting: DPA, FERPA check, privacy rating, security audit, WCAG 2.1 AA | AI hub; School Software page citing 6A-1.0955 | **Deployment (B)** | See §6. |
| Canvas access | District-wide Canvas since 2016 (`browardschools.instructure.com`). Canvas breach Apr 25 – May 2026 involved messages. | **Deployment** | Admins can limit personal access tokens to admins; whether BCPS has done so is unknown. After the breach, expect scrutiny of anything reading messages. A product should be an admin-installed LTI 1.3 app, not a personal token. |
| Incident reporting | Security Incident Handling Guidelines (CSIRT; 01/13/17) | **Deployment** | A leaked key, crosswalk, roster CSV or Canvas token goes to the district CSIRT. The exact reporting steps are unverified. |
| Records retention and disposal | Policy 5100.2 (to 8540); Records Retention dept. | **Deployment** | Same point as the Florida public-records row. |

### The AI provider (Anthropic)

| Plan | Training on inputs | Retention | Minimum age | Usable for BCPS student data? |
|---|---|---|---|---|
| Consumer Free/Pro/Max (incl. Claude Code) | Yes unless opted out (feedback and safety-flagged material may still be used) | 5 years with training on, 30 days off; `/feedback` `/bug` `/share` kept 5 years | 18+ | **No** |
| Commercial (Team/Enterprise/API) | No ("may not train on Customer Content"); DPA incorporated | 30 days standard; zero data retention for qualified Enterprise/API | — | Only under a district-approved agreement |
| Claude for Teachers, individual (launched Jul 14 2026) | No (help center) | per K-12 terms | educators | **Not with identifiable data** without district authorization (Anthropic's own words) |
| Claude for Teachers, district offering + K-12 DPA + Public Sector Addendum (Aug 28 2026) | No; the DPA bars ads and profiling | Deletion within 30 days of termination | — | **The intended path**, once BCPS signs |

Also: Claude Code keeps **local plaintext transcripts** under `~/.claude/projects/` for 30 days by default. They hold the (pseudonymized) tool output, so they're another local copy of student data on the teacher's machine.

---

## 4. Code gaps the legal review found (for the next session)

None of these block today's branch. They are the changes the law points to, most important first.

1. **Records retention (FL Ch. 119, GS7/GS1-SL).**
   - Keep the audit log and crosswalk out of any automatic deletion. They already are; add a test that pins this.
   - Make `privacy purge --crosswalk` print a notice that the crosswalk may be a public record and to check with the BCPS records custodian first.
   - The 30-day auto-purge only touches downloaded *copies* of Canvas files, whose originals stay in Canvas. That's defensible as disposal of duplicates. Say so in the README, and make the retention period configurable to 0 (never purge).
2. **Student ID numbers in free text.** The audit fix stopped scrubbing all-digit SIS ids, because they matched assignment numbers. Florida student IDs are numeric, so one typed into a post now goes out. Restore it in strict mode for long ids (≥ 7 digits), with digit-boundary matching, and test that it doesn't hit short assignment numbers.
3. **IEP/504/accommodation data (IDEA 300.622–623).** In strict mode, suppress or flag:
   - assignment overrides (extended time and dates per student)
   - `accommodation`/`IEP`/`504` keywords in comments and notes

   Add `CANVAS_PRIVACY_SENSITIVE_TERMS` for district-specific terms. Canvas has no single field for this, so the list needs BCPS's conventions.
4. **Biometric and protected categories (1002.222, 1014.04).**
   - Refuse to read audio or video file content in strict mode. `read_file` is text-only today, so pin that with a test.
   - Document: never route voice or video submissions to AI analysis.
   - Consider a strict-mode redaction for religion or political-affiliation survey-style fields. Low priority.
5. **Plan check and warning.** The server can't see which Claude plan the teacher uses. Add a one-time startup notice in strict mode, and a README section: "use only under a district agreement (Claude for Teachers district offering / K-12 DPA); never a consumer plan". Consider a `CANVAS_PRIVACY_AGREEMENT=<reference>` setting, recorded in the audit log, so the teacher records which agreement authorizes use.
6. **Incident response.** Add a README "If something leaks" section:
   - rotate the Canvas token and `CANVAS_MCP_AUTH_TOKEN`
   - report to the BCPS CSIRT
   - note the 501.171 timelines (district: 30 days to individuals; a vendor: 10 days to the district)
   - what's in each local file
7. **Claude Code transcripts.** Document `~/.claude/projects/` retention and how to shorten it (`cleanupPeriodDays`), since it holds tool output.
8. **Site copy (FTC Act §5, claims guard).** The `/canvas` page still says anonymisation is opt-in. When it's rewritten: no "FERPA compliant", no "certified", no "safe for student data". Keep to factual descriptions of the controls.

---

## 5. What to do, by scenario

### A. The teacher, now
1. Don't run it against real BCPS courses yet. Use a sandbox course with synthetic students (Canvas lets teachers create one).
2. Ask BCPS (questions in §7) about approving the tool or the data flow, and whether the district has signed, or will sign, Anthropic's K-12 DPA for Claude for Teachers.
3. If approved:
   - use only the district-provisioned Claude account
   - keep `CANVAS_PRIVACY_MODE=strict`
   - use stdio, not a tunnel
   - keep full-disk encryption and a screen lock on the machine
   - record the agreement reference
4. Keep the assistant from grading or deciding on its own. The confirm gate already requires the teacher to approve every write; keep it that way.

### B. A product for districts, later
Minimum set Florida districts are likely to ask for:
- a signed **SDPC NDPA** (v2.2, Nov 2025) with the **Florida Exhibit G**
- **1006.1494** operator compliance: no ads, profiling or sale, deletion at course end or within 90 days
- **6A-1.0955** review readiness
- **6A-1.0957** AI terms: no training, no monetizing
- **COPPA 2025** security program and retention policy
- **501.171** third-party-agent breach terms: 10 days
- a **SOC 2 Type II** or **ISO 27001(+27701)**
- a **VPAT/ACR** to WCAG 2.1 AA
- an independent privacy rating: **1EdTech TrustEd Apps** or **Common Sense**
- **LTI 1.3** (admin-installed) instead of personal tokens, ideally 1EdTech-certified
- AI provider terms passed through: commercial terms or the K-12 DPA, zero or minimal retention, no training

---

## 6. Certifications and attestations (2026)

There is **no FERPA certification**. The U.S. Department of Education certifies nothing.

| Item | What it is | Status and relevance |
|---|---|---|
| **SDPC NDPA** + FL Exhibit G | Standard contract (not a certification); other districts join via Exhibit E | **The practical requirement.** The Florida alliance is active; BCPS's hub cites it. No fee; legal review effort. |
| Student Privacy Pledge (FPF/SIIA) | Voluntary pledge | **Retired Apr 25, 2025.** Don't claim it. FPF points to CISA's K-12 Secure by Design Pledge and the NDPA. |
| iKeepSafe FERPA / COPPA Safe Harbor / CSPC | Paid product assessment and monitoring | A trust badge; not a known BCPS requirement. |
| 1EdTech TrustEd Apps Data Privacy seal | Rubric review of privacy policy and terms, including AI policy | Districts can require it in RFPs; may be what BCPS's "independent privacy rating" means (unverified). |
| 1EdTech LTI 1.3 / Advantage certification | Integration conformance (not privacy) | Relevant for a Canvas product; admin install either way. |
| Common Sense Privacy ratings | Policy evaluation | Active; possibly BCPS's rating source (unverified). |
| SOC 2 Type II | CPA-audited controls over 3–12 months | Fits BCPS's "independent security audit". High cost and effort. |
| ISO/IEC 27001 (+27701) | Certified information-security management system (27701 adds privacy) | Alternative to SOC 2. |
| GovRAMP (StateRAMP renamed Feb 2025) | NIST 800-53 cloud authorization | Florida adoption not confirmed. |
| CSA STAR | Cloud controls, self or audited | Rarely required in K-12. |
| VPAT/ACR (WCAG 2.1 AA) | Accessibility conformance report | **BCPS explicitly tests WCAG 2.1 AA.** |
| Project Unicorn | Interoperability rubric | Low relevance. |

---

## 7. Questions to send BCPS

Addressed to Instructional Technology (Innovative Learning), the District Software Data Collection Team, and Information Systems:

1. Is there a process for a teacher to request review of a locally run tool that connects to Canvas and sends pseudonymized course data to an AI provider? Who owns it?
2. Has BCPS signed, or does it plan to sign, Anthropic's K-12 DPA / Claude for Teachers district offering? If not, is any Claude/Anthropic use approved for staff?
3. Is creating a Canvas personal access token permitted for teachers, or restricted to admins? Would a tool like this need to be an admin-installed LTI 1.3 app instead?
4. Does BCPS classify a teacher's local audit log and label crosswalk as public records? Which retention schedule item applies, and who approves disposal?
5. How should accommodation/IEP/504 information in Canvas be identified so a tool can exclude it?
6. What's the incident-reporting path for an employee (CSIRT contact, timeline) if a device holding these files, or a Canvas token, is compromised?
7. Does the FAC 6A-1.0957 AI rule (adopted Sep 16, 2026) treat a teacher-facing tool that analyses existing data as outside the student opt-in requirement, and what will BCPS's policy require by July 1, 2027?
8. Is BCPS a member of the Florida Student Privacy Alliance, and which NDPA version and exhibits does it use?

---

## 8. Not verified: check before relying on it

- Exact CFR and Florida statute wording (read from search extracts only), including the 34 CFR 99.32(d) and 99.7(a)(3)(iii) sub-cites.
- Whether the FERPA NPRM (RIN 1875-AA15; targeted Jan 2026) has been published.
- Whether the ADA Title II interim final rule (Apr 20, 2026) has been finalized.
- The final text and effective date of the FAC 6A-1.0957 AI amendment.
- The text of FAC 6A-1.09550.
- Whether Fla. Stat. 282.3185 now covers school districts.
- BCPS: Policy 5100.1's directory-information list and school-official wording; whether Policy 8500 has been adopted; privacy officer and request form; NDPA registry entries; Florida Student Privacy Alliance membership; Canvas token settings; the incident-reporting steps; CIO name (seen only in third-party directories).
- Whether the K-12 DPA text itself (not only the help center) contains the no-training clause.
- The GS1-SL #393/#394 retention periods.

## 9. Sources

**Federal**
- https://www.ecfr.gov/current/title-34/subtitle-A/part-99
- https://www.ecfr.gov/current/title-34/subtitle-A/part-99/subpart-A/section-99.3
- https://www.ecfr.gov/current/title-34/subtitle-A/part-99/subpart-D/section-99.31
- https://studentprivacy.ed.gov/faq/who-school-official-under-ferpa
- https://studentprivacy.ed.gov/sites/default/files/resource_document/file/Vendor%20FAQ.pdf
- https://studentprivacy.ed.gov/sites/default/files/resource_document/file/data_deidentification_terms_0.pdf
- https://studentprivacy.ed.gov/sites/default/files/resource_document/file/Student%20Privacy%20and%20Online%20Educational%20Services%20(February%202014)_0.pdf
- https://studentprivacy.ed.gov/sites/default/files/resource_document/file/TOS_Guidance_Mar2016.pdf
- https://studentprivacy.ed.gov/sites/default/files/resource_document/file/Secretary_Comb_SPPO_DCL_Annual%20Notice_0.pdf
- https://www.reginfo.gov/public/do/eAgendaViewRule?pubId=202504&RIN=1875-AA15
- https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule
- https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions
- https://www.ftc.gov/legal-library/browse/policy-statement-federal-trade-commission-education-technology-childrens-online-privacy-protection
- https://www.ftc.gov/news-events/news/press-releases/2026/06/ftc-gives-final-approval-order-against-illuminate-settling-allegations-it-failed-secure-students
- https://www.ecfr.gov/current/title-34/subtitle-B/chapter-III/part-300/subpart-F/subject-group-ECFR1d2a18271819883
- https://studentprivacy.ed.gov/sites/default/files/resource_document/file/IDEA-FERPA%20Crosswalk_08242022.pdf
- https://www.federalregister.gov/documents/2024/04/24/2024-07758/nondiscrimination-on-the-basis-of-disability-accessibility-of-web-information-and-services-of-state
- https://www.federalregister.gov/documents/2026/04/20/2026-07663/extension-of-compliance-dates-for-nondiscrimination-on-the-basis-of-disability-accessibility-of-web
- https://www.ada.gov/resources/2024-03-08-web-rule/

**Florida**
- https://www.flsenate.gov/Laws/Statutes/2025/1002.22
- https://www.flsenate.gov/Laws/Statutes/2025/1002.221
- https://www.flsenate.gov/Laws/Statutes/2025/1002.222
- https://www.flsenate.gov/Laws/Statutes/2025/1006.1494
- https://www.flsenate.gov/Session/Bill/2023/662/BillText/er/HTML
- https://www.flsenate.gov/Laws/Statutes/2025/501.171
- https://www.flsenate.gov/Laws/Statutes/2024/1014.04
- https://www.flsenate.gov/Session/Bill/2023/262/BillText/er/HTML
- https://www.flsenate.gov/Laws/Statutes/2024/282.3185
- https://flrules.org/gateway/ruleno.asp?id=6A-1.0955
- https://flrules.org/gateway/ruleNo.asp?id=6A-1.0957
- https://www.fldoe.org/newsroom/latest-news/florida-sets-national-standard-for-responsible-ai-in-classroomsfrom-vpk-through-college.stml
- https://www.wlrn.org/education/2026-09-17/florida-approves-statewide-ai-rules-for-k-12-schools-and-colleges
- https://files.floridados.gov/media/706696/gs7-2023-final.pdf
- https://files.floridados.gov/media/706717/gs1-sl-june-2023.pdf
- https://sdpc.a4l.org/view_alliance.php?state=FL
- https://files.a4l.org/privacy/NDPA/NDPA_v2-2_STANDARD_WEB.pdf

**Broward**
- https://www.browardschools.com/cms/lib/FL01803656/Centricity/domain/13784/privacy/Policy%205100.1.pdf
- https://web01.browardschools.com/sbbcpolicies/docs/P5306,000.pdf
- https://content.civicplus.com/api/assets/fl-browardcounty-legalnotices/1bd22596-9859-4f56-8d4c-50bb041ab5ab
- https://www.browardschools.com/academics/welcome-office-of-academics/school-software
- https://www.browardschools.com/privacyinformation
- https://www.browardschools.com/cms/lib/FL01803656/Centricity/domain/13784/privacy/security-incident-handling-guidelines-011317.pdf
- https://browardschools.ai/
- https://www.edweek.org/technology/a-cyberattack-on-canvas-could-cause-lasting-aftershocks-for-schools/2026/05
- https://community.instructure.com/en/discussion/660299/strengthening-security-in-canvas-updates-to-user-access-token-management

**Anthropic**
- https://www.anthropic.com/legal/consumer-terms
- https://www.anthropic.com/legal/commercial-terms
- https://www.anthropic.com/legal/k12-dpa
- https://www.anthropic.com/news/claude-for-teachers
- https://support.claude.com/en/articles/15926041-claude-for-teachers-your-data-and-our-terms
- https://code.claude.com/docs/en/data-usage

**Certifications**
- https://privacy.a4l.org/national-dpa/
- https://fpf.org/student-privacy-pledge/
- https://ikeepsafe.org/certifications/
- https://www.1edtech.org/trustedapps/seal
- https://privacy.commonsense.org/
- https://govramp.org/
