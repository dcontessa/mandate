"""Generate wholly fictional Mandate fixtures. No network, credentials or client inputs."""
from pathlib import Path
import hashlib
import json
import zipfile
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from pypdf import PdfReader, PdfWriter

BASE = Path(__file__).resolve().parent
DOCS = BASE / 'documents'
DOCS.mkdir(parents=True, exist_ok=True)
PDF_OUT = BASE.parent / 'pdf'
PDF_OUT.mkdir(parents=True, exist_ok=True)
TMP = BASE.parent.parent / 'tmp' / 'pdfs'
TMP.mkdir(parents=True, exist_ok=True)
NAVY, GREEN, GREY = '#172B3A', '#DAF28B', '#536170'
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='TitleDemo', fontName='Helvetica-Bold', fontSize=24, leading=28, textColor=colors.HexColor(NAVY), spaceAfter=12))
styles.add(ParagraphStyle(name='Deck', fontName='Helvetica', fontSize=11, leading=16, textColor=colors.HexColor(GREY), spaceAfter=14))
styles.add(ParagraphStyle(name='SectionDemo', fontName='Helvetica-Bold', fontSize=12, leading=16, spaceBefore=16, spaceAfter=8, textColor=colors.HexColor(NAVY)))
styles.add(ParagraphStyle(name='BodyDemo', fontName='Helvetica', fontSize=10, leading=15, spaceAfter=8, textColor=colors.HexColor(NAVY)))
styles.add(ParagraphStyle(name='CellDemo', fontName='Helvetica', fontSize=9, leading=13, textColor=colors.HexColor(NAVY)))
styles.add(ParagraphStyle(name='SmallDemo', fontName='Helvetica', fontSize=8, leading=11, textColor=colors.HexColor(GREY)))

def para(text, style='BodyDemo'):
    return Paragraph(escape(text), styles[style])

def table(rows, widths):
    result = Table([[para(str(c), 'CellDemo') for c in row] for row in rows], colWidths=widths, hAlign='LEFT')
    result.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor(GREEN)),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 10), ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 9), ('BOTTOMPADDING', (0, 0), (-1, -1), 9),
        ('LINEBELOW', (0, 0), (-1, 0), 0.5, colors.HexColor(NAVY)),
        ('LINEBELOW', (0, 1), (-1, -1), 0.3, colors.HexColor('#DCE3E7')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F6F8FA')]),
    ]))
    return result

def footer(canvas, doc):
    canvas.setTitle(doc.title)
    canvas.setAuthor('Mandate synthetic demo')
    canvas.setFillColor(colors.HexColor(NAVY))
    canvas.rect(0, A4[1]-34, A4[0], 34, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont('Helvetica-Bold', 9)
    canvas.drawString(44, A4[1]-22, 'MANDATE  /  SYNTHETIC DEMO ONLY')
    canvas.setStrokeColor(colors.HexColor('#DCE3E7'))
    canvas.line(44, 49, A4[0]-44, 49)
    canvas.setFillColor(colors.HexColor(GREY))
    canvas.setFont('Helvetica', 8)
    canvas.drawString(44, 34, 'Fictional data. No real authority, signatures, filings or delivery evidence.')

def pdf(path, title, subtitle, body):
    doc = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=44, rightMargin=44, topMargin=62, bottomMargin=65, title=title)
    doc.build([para(title, 'TitleDemo'), para(subtitle, 'Deck')] + body, onFirstPage=footer, onLaterPages=footer)
    assert len(PdfReader(str(path)).pages) == 1, f'Expected one page: {path}'

def section(title):
    return para(title, 'SectionDemo')

source_file = DOCS / '01_Approved_Board_Record.pdf'
pdf(source_file, 'Board authority record', 'Demo Company Alpha | Source fixture BR-001 | Version 1', [
    table([['Field', 'Fictional scenario value'], ['Company reference', 'co_demo_alpha - not a registration number'], ['Scenario date', '7 September 2026'], ['Permitted signatories', 'Person A (Demo) AND Person B (Demo), jointly'], ['Not authorised by this record', 'Person C (Demo)'], ['Purpose', 'Prepare an illustrative banking instruction package for professional review.']], [145, 362]),
    section('Authority represented in the scenario'),
    para('Assume a professional has reviewed this fictional source record. The scenario permits exactly A and B acting jointly. It does not permit adding C, using a different company, or changing the approval conditions.'),
    section('Separate release approval required'),
    para('This source fixture is not approval to send a document. A designated reviewer must approve the exact package version, recipient and action in the running app. An edited package requires a fresh review.'),
    section('Deliberately non-executable'),
    para('This is a software test record, not a legal resolution template. It contains no genuine signature, company number, bank account, identity document or certification. Do not submit it to a bank or regulator.'),
])

package_files = []
for version, filename, signatories, note in [
    (1, '02_Banking_Package_v1.pdf', 'Person A (Demo) + Person B (Demo), jointly', 'Original package for review.'),
    (2, '03_Banking_Package_v2_Changed.pdf', 'Person A (Demo) + Person B (Demo), jointly', 'Changed handling instruction: hold for an additional internal review. This content change invalidates any approval of version 1.'),
    (3, '04_Banking_Package_v3_Unauthorised.pdf', 'Person A (Demo) + Person B (Demo) + Person C (Demo)', 'Negative test: Person C has been added even though the source record only authorises A and B.'),
]:
    path = DOCS / filename
    pdf(path, 'Banking instruction package', f'Demo Company Alpha | PKG-001 | Version {version}', [
        table([['Field', 'Fictional scenario value'], ['Source authority', 'BR-001, version 1'], ['Requested signatories', signatories], ['Destination label', 'Mandate sandbox receiver - primary'], ['Permitted action', 'Release this test document to the configured sandbox receiver only.'], ['Real account / institution', 'None. No bank integration or banking action.']], [145, 362]),
        section('Package instruction'), para(note),
        section('Required review'),
        para('The reviewer must inspect this exact version. The release decision must bind the company, engagement, source record hash, package hash, action and recipient. Approval of one version does not authorise another.'),
        section('Demonstration boundary'),
        para('The destination label is not a live address. No network request has been made by this file. Configure a test-only receiver separately and generate genuine runtime receipts only after an actual test delivery.'),
    ])
    package_files.append(path)

months = [
    {'month': '2026-06', 'revenue': 80000, 'direct_costs': 48000, 'operating_expenses': 22000},
    {'month': '2026-07', 'revenue': 92000, 'direct_costs': 55200, 'operating_expenses': 23800},
    {'month': '2026-08', 'revenue': 105000, 'direct_costs': 63000, 'operating_expenses': 26000},
]
for m in months:
    m['gross_profit'] = m['revenue'] - m['direct_costs']
    m['illustrative_operating_profit'] = m['gross_profit'] - m['operating_expenses']
accounting_file = DOCS / '05_Illustrative_Management_Summary.pdf'
pdf(accounting_file, 'Management summary', 'Demo Company Alpha | June-August 2026 | MYR | Synthetic amounts', [
    table([['Metric (MYR)', 'June', 'July', 'August']] + [[label] + [f"{m[key]:,.0f}" for m in months] for label, key in [('Revenue', 'revenue'), ('Direct costs', 'direct_costs'), ('Gross profit', 'gross_profit'), ('Operating expenses', 'operating_expenses'), ('Illustrative operating profit', 'illustrative_operating_profit')]], [225, 94, 94, 94]),
    section('What this sample is for'),
    para('Use as an uploaded accounting document in the client workspace. Its purpose is to test company and period tagging, document review and recipient permissions. It is not a complete set of financial statements.'),
    section('Provenance and limits'),
    para('Every number was invented for this demo. This is not an AutoCount export or a representation of its file format. No client records, tax computation, audit opinion or accounting-standard compliance claim is included.'),
    section('Workflow state'),
    para('Awaiting accounting review. A secretarial engagement permission must not automatically grant access to accounting documents. This sample is not part of the initial banking-package release.'),
])

tax_file = DOCS / '06_Tax_Document_Checklist.pdf'
tax_rows = [
    {'item': 'Year-end trial balance', 'status': 'Missing', 'owner': 'Client finance contact (Demo)'},
    {'item': 'Fixed asset schedule', 'status': 'Requested', 'owner': 'Client finance contact (Demo)'},
    {'item': 'Prior-period working papers', 'status': 'Pending staff review', 'owner': 'Tax preparer (Demo)'},
    {'item': 'Client approval of completed pack', 'status': 'Not started', 'owner': 'Client representative (Demo)'},
]
pdf(tax_file, 'Tax document checklist', 'Demo Company Alpha | Illustrative engagement | No statutory deadlines', [
    table([['Requested document / action', 'Demo state', 'Owner']] + [[r['item'], r['status'], r['owner']] for r in tax_rows], [210, 125, 172]),
    section('What this sample is for'),
    para('Illustrate missing-document tracking and handoffs in a separate tax engagement. These are example checklist items, not a complete or legally prescribed list.'),
    section('Professional judgement stays with the practitioner'),
    para('No tax rates, liabilities, filing dates or submission authority are generated. A qualified practitioner must determine real requirements outside this fictional demonstration.'),
    section('Scope boundary'),
    para('This file supports future workspace testing. The first end-to-end demo remains the approved banking-package release. No tax submission, client email or external filing has occurred.'),
])

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

documents = []
for ident, path, kind, version, engagement, signers in [
    ('doc_board_v1', source_file, 'source_authority_fixture', 1, 'eng_alpha_sec', ['person_a', 'person_b']),
    ('doc_bank_v1', package_files[0], 'release_package', 1, 'eng_alpha_sec', ['person_a', 'person_b']),
    ('doc_bank_v2', package_files[1], 'release_package', 2, 'eng_alpha_sec', ['person_a', 'person_b']),
    ('doc_bank_v3', package_files[2], 'release_package', 3, 'eng_alpha_sec', ['person_a', 'person_b', 'person_c']),
    ('doc_accounts_v1', accounting_file, 'management_summary_fixture', 1, 'eng_alpha_acc', []),
    ('doc_tax_v1', tax_file, 'document_checklist_fixture', 1, 'eng_alpha_tax', []),
]:
    documents.append({'id': ident, 'tenant_id': 'tenant_demo_one', 'company_id': 'co_demo_alpha', 'engagement_id': engagement, 'kind': kind, 'version': version, 'path': path.relative_to(BASE).as_posix(), 'sha256': digest(path), 'synthetic': True, 'signatory_ids': signers})

actors = [
    {'id': 'staff_preparer', 'display_name': 'Alex Preparer (Demo)', 'email': 'alex@practice-one.example', 'kind': 'staff'},
    {'id': 'staff_reviewer', 'display_name': 'Riley Reviewer (Demo)', 'email': 'riley@practice-one.example', 'kind': 'staff'},
    {'id': 'staff_accountant', 'display_name': 'Sam Accountant (Demo)', 'email': 'sam@practice-one.example', 'kind': 'staff'},
    {'id': 'staff_tax', 'display_name': 'Taylor Tax Reviewer (Demo)', 'email': 'taylor@practice-one.example', 'kind': 'staff'},
    {'id': 'person_a', 'display_name': 'Person A (Demo)', 'email': 'person-a@company-alpha.example', 'kind': 'client_person'},
    {'id': 'person_b', 'display_name': 'Person B (Demo)', 'email': 'person-b@company-alpha.example', 'kind': 'client_person'},
    {'id': 'person_c', 'display_name': 'Person C (Demo)', 'email': 'person-c@company-alpha.example', 'kind': 'client_person'},
    {'id': 'staff_other_firm', 'display_name': 'Morgan Other Practice (Demo)', 'email': 'morgan@practice-two.example', 'kind': 'staff'},
    {'id': 'agent_release', 'display_name': 'Release Agent (Demo)', 'email': None, 'kind': 'agent', 'terminal3_did': None},
]
seed = {
    'schema_version': '1.0.0',
    'metadata': {'product': 'Mandate', 'synthetic': True, 'purpose': 'Hackathon development fixtures; not production records', 'scenario_date': '2026-09-07', 'timezone': 'Asia/Kuala_Lumpur', 'contains_client_data': False, 'fixture_only': True, 'source': 'Wholly invented, not anonymised or derived from Macro client records'},
    'tenants': [{'id': 'tenant_demo_one', 'name': 'Demo Practice One'}, {'id': 'tenant_demo_two', 'name': 'Demo Practice Two'}],
    'companies': [
        {'id': 'co_demo_alpha', 'tenant_id': 'tenant_demo_one', 'name': 'Demo Company Alpha', 'registration_number': None, 'purpose': 'Primary secretarial workflow plus separate accounting and tax fixtures'},
        {'id': 'co_demo_beta', 'tenant_id': 'tenant_demo_one', 'name': 'Demo Company Beta', 'registration_number': None, 'purpose': 'Same-firm cross-client access boundary'},
        {'id': 'co_demo_gamma', 'tenant_id': 'tenant_demo_two', 'name': 'Demo Company Gamma', 'registration_number': None, 'purpose': 'Cross-tenant access boundary'},
    ],
    'actors': actors,
    'engagements': [
        {'id': 'eng_alpha_sec', 'tenant_id': 'tenant_demo_one', 'company_id': 'co_demo_alpha', 'service': 'secretarial', 'state': 'awaiting_review'},
        {'id': 'eng_alpha_acc', 'tenant_id': 'tenant_demo_one', 'company_id': 'co_demo_alpha', 'service': 'accounting', 'state': 'awaiting_review'},
        {'id': 'eng_alpha_tax', 'tenant_id': 'tenant_demo_one', 'company_id': 'co_demo_alpha', 'service': 'taxation', 'state': 'awaiting_documents'},
        {'id': 'eng_beta_sec', 'tenant_id': 'tenant_demo_one', 'company_id': 'co_demo_beta', 'service': 'secretarial', 'state': 'not_started'},
        {'id': 'eng_gamma_sec', 'tenant_id': 'tenant_demo_two', 'company_id': 'co_demo_gamma', 'service': 'secretarial', 'state': 'not_started'},
    ],
    'memberships': [
        {'actor_id': 'staff_preparer', 'engagement_id': 'eng_alpha_sec', 'role': 'preparer'},
        {'actor_id': 'staff_reviewer', 'engagement_id': 'eng_alpha_sec', 'role': 'reviewer'},
        {'actor_id': 'staff_accountant', 'engagement_id': 'eng_alpha_acc', 'role': 'reviewer'},
        {'actor_id': 'staff_tax', 'engagement_id': 'eng_alpha_tax', 'role': 'reviewer'},
        {'actor_id': 'person_a', 'engagement_id': 'eng_alpha_sec', 'role': 'client_representative'},
        {'actor_id': 'person_b', 'engagement_id': 'eng_alpha_sec', 'role': 'client_representative'},
        {'actor_id': 'agent_release', 'engagement_id': 'eng_alpha_sec', 'role': 'release_agent'},
        {'actor_id': 'staff_other_firm', 'engagement_id': 'eng_gamma_sec', 'role': 'reviewer'},
    ],
    'documents': documents,
    'source_authorities': [{'id': 'auth_alpha_bank', 'company_id': 'co_demo_alpha', 'engagement_id': 'eng_alpha_sec', 'source_document_id': 'doc_board_v1', 'source_sha256': digest(source_file), 'allowed_signatory_ids': ['person_a', 'person_b'], 'signatory_mode': 'exact_set_jointly', 'status': 'synthetic_reviewed_source_fixture', 'validity': {'mode': 'test_setup_relative', 'valid_from_minutes_after_reset': -5, 'expires_minutes_after_reset': 60}, 'legal_validity_asserted': False}],
    'destinations': [{'id': 'sandbox_primary', 'label': 'Sandbox receiver - primary', 'configured_url': None}, {'id': 'sandbox_alternate', 'label': 'Sandbox receiver - alternate', 'configured_url': None}],
    'release_requests': [{'id': 'request_alpha_001', 'tenant_id': 'tenant_demo_one', 'company_id': 'co_demo_alpha', 'engagement_id': 'eng_alpha_sec', 'created_by_actor_id': 'staff_preparer', 'executing_agent_id': 'agent_release', 'source_authority_id': 'auth_alpha_bank', 'source_document_sha256': digest(source_file), 'document_id': 'doc_bank_v1', 'document_version': 1, 'document_sha256': digest(package_files[0]), 'requested_signatory_ids': ['person_a', 'person_b'], 'action': 'release_to_sandbox', 'destination_id': 'sandbox_primary', 'state': 'awaiting_human_approval', 'idempotency_key': 'demo-release-alpha-001'}],
    'human_release_approvals': [],
    'runtime_events': [],
    'terminal3_proofs': [],
    'delivery_receipts': [],
    'accounting_fixture': {'company_id': 'co_demo_alpha', 'engagement_id': 'eng_alpha_acc', 'currency': 'MYR', 'not_an_autocount_export': True, 'months': months},
    'tax_checklist_fixture': {'company_id': 'co_demo_alpha', 'engagement_id': 'eng_alpha_tax', 'not_a_statutory_checklist': True, 'items': tax_rows},
    'runtime_setup_required': {'seed_allowed_only_in_isolated_demo_environment': True, 'real_terminal3_did_required_for_live_proof': True, 'terminal3_credentials_in_fixture': False, 'receiver_must_be_configured_server_side': True, 'fail_closed_if_setup_missing': True, 'public_role_switcher_is_not_authentication': True, 'demo_reset_route_publicly_available': False},
    'approval_binding_fields': ['tenant_id', 'company_id', 'engagement_id', 'source_authority_id', 'source_document_sha256', 'document_id', 'document_version', 'document_sha256', 'requested_signatory_ids', 'action', 'destination_id', 'executing_agent_id', 'runtime_agent_did', 'policy_version', 'expires_at'],
}
cases = [
    {'id': 'S01', 'title': 'Authorised release', 'change': 'Keep the source and package v1 unchanged. Reviewer approves the exact snapshot; configure a real T3 identity, matching grant and sandbox receiver.', 'expected': 'One sandbox delivery and a genuine runtime receipt.', 'expected_delivery_count': 1},
    {'id': 'S02', 'title': 'Unapproved signatory', 'change': 'Use package v3 and request A+B+C. A release approval cannot override the source record restriction.', 'expected': 'Block: signatory C is not authorised by the source fixture.', 'expected_delivery_count': 0},
    {'id': 'S03', 'title': 'Document changed after approval', 'change': 'Approve package v1, then substitute package v2. Signatories stay A+B but file bytes and version change.', 'expected': 'Block: approval snapshot mismatch; require new review.', 'expected_delivery_count': 0},
    {'id': 'S04', 'title': 'Recipient changed after approval', 'change': 'Approve sandbox_primary, then request sandbox_alternate with all other inputs unchanged.', 'expected': 'Block: recipient no longer matches approval.', 'expected_delivery_count': 0},
    {'id': 'S05', 'title': 'Cross-client / cross-service / cross-tenant access', 'change': 'As staff_preparer, call protected APIs directly for eng_beta_sec, eng_alpha_acc and eng_gamma_sec in three separate tests.', 'expected': 'Deny all three; no document bytes or sensitive record metadata disclosed.', 'expected_delivery_count': 0},
    {'id': 'S06', 'title': 'Expired authority', 'change': 'Approve a valid snapshot, then advance only the test clock beyond source-authority expiry; keep release approval otherwise current.', 'expected': 'Block at final execution because source authority has expired.', 'expected_delivery_count': 0},
    {'id': 'S07', 'title': 'No matching Terminal 3 outbound grant', 'change': 'Satisfy business checks and human approval, but withhold the required outbound grant in the real T3 test environment.', 'expected': 'No delivery. Capture the actual T3 denial; never seed a fake proof or hardcode a successful SDK response.', 'expected_delivery_count': 0},
    {'id': 'S08', 'title': 'Retry after delivery timeout', 'change': 'Receiver accepts S01 but worker times out before recording success. Retry with the same idempotency key and receiver-side deduplication.', 'expected': 'Exactly one receiver-side delivery in total; reconcile the existing receipt. App-only deduplication is insufficient.', 'expected_delivery_count': 1},
    {'id': 'S09', 'title': 'Missing human approval / self-approval', 'change': 'Try release with empty approvals, then try to approve as the preparer or executing agent.', 'expected': 'Deny release and self-approval; an authorised independent reviewer is required.', 'expected_delivery_count': 0},
]
seed['acceptance_scenarios'] = {'results_are_expectations_not_executed_tests': True, 'independent_reset_before_each_scenario': True, 'cases': cases}
(BASE / 'Mandate_Demo_Seed.json').write_text(json.dumps(seed, indent=2) + '\n', encoding='utf-8')

intro = TMP / 'mandate_demo_intro.pdf'
pdf(intro, 'A safe dataset.\nA real workflow.', 'Mandate | Synthetic demo pack | Corporate actions, properly authorised.', [
    para('This pack is wholly invented. It contains no Macro client records, anonymised client extracts, real account details or genuine signatures.'),
    table([['Included', 'Purpose'], ['3 fictional companies / 2 practices', 'Model client and tenant boundaries.'], ['6 sample PDF documents', 'Open and review documents during the demo.'], ['Structured JSON fixtures', 'Seed an isolated development environment.'], ['9 acceptance scenarios', 'Define expected behaviour, not claim passed tests.']], [230, 277]),
    section('The primary demonstration'),
    para('Open the approved source record for A+B. Review package v1. Approve the exact document and sandbox recipient. Run the authorised agent action and inspect its real delivery receipt. Then change the document or add C and demonstrate the block.'),
    section('Prepared now / still to build'),
    para('Prepared: fictional records, documents, hashes and expected outcomes. Still to build and test: authentication, server-side access rules, approval binding, Terminal 3 integration, sandbox delivery and runtime evidence.'),
    section('Privacy is not permission to fake evidence'),
    para('Synthetic business data is appropriate for public demos. Agent identities, execution proofs, approvals and delivery receipts must accurately reflect what actually ran. All proof and receipt arrays start empty.'),
])
preview = PDF_OUT / 'Mandate_Demo_Preview.pdf'
writer = PdfWriter()
for path in [intro, source_file, *package_files, accounting_file, tax_file]:
    writer.append(str(path))
writer.add_metadata({'/Title': 'Mandate - Synthetic Demo Pack', '/Author': 'Mandate synthetic demo'})
with preview.open('wb') as f:
    writer.write(f)

def validate():
    tenant_ids = {x['id'] for x in seed['tenants']}
    companies = {x['id']: x for x in seed['companies']}
    engagements = {x['id']: x for x in seed['engagements']}
    actor_ids = {x['id'] for x in seed['actors']}
    doc_map = {x['id']: x for x in seed['documents']}
    for key in ['tenants', 'companies', 'engagements', 'actors', 'documents']:
        assert len({x['id'] for x in seed[key]}) == len(seed[key]), key
    for c in companies.values():
        assert c['tenant_id'] in tenant_ids
        assert c['registration_number'] is None
    for e in engagements.values():
        assert companies[e['company_id']]['tenant_id'] == e['tenant_id']
    for m in seed['memberships']:
        assert m['actor_id'] in actor_ids and m['engagement_id'] in engagements
    for d in documents:
        assert digest(BASE / d['path']) == d['sha256']
        assert d['company_id'] == engagements[d['engagement_id']]['company_id']
        assert d['tenant_id'] == engagements[d['engagement_id']]['tenant_id']
        assert set(d['signatory_ids']) <= actor_ids
        text = PdfReader(str(BASE / d['path'])).pages[0].extract_text()
        assert 'SYNTHETIC DEMO ONLY' in text and 'Fictional data.' in text
    req = seed['release_requests'][0]
    assert req['document_sha256'] == doc_map[req['document_id']]['sha256']
    assert req['source_document_sha256'] == seed['source_authorities'][0]['source_sha256']
    assert set(req['requested_signatory_ids']) == set(seed['source_authorities'][0]['allowed_signatory_ids'])
    assert len({doc_map[x]['sha256'] for x in ['doc_bank_v1', 'doc_bank_v2', 'doc_bank_v3']}) == 3
    for actor in actors:
        assert actor['email'] is None or actor['email'].endswith('.example')
    for key in ['human_release_approvals', 'runtime_events', 'terminal3_proofs', 'delivery_receipts']:
        assert seed[key] == []
    for m in months:
        assert m['gross_profit'] == m['revenue'] - m['direct_costs']
        assert m['illustrative_operating_profit'] == m['gross_profit'] - m['operating_expenses']
    assert len(PdfReader(str(preview)).pages) == 7
    return {'fixture_validation': 'passed', 'validated': ['unique identifiers', 'company/tenant/engagement references', 'six PDF file hashes', 'PDF demo labels', 'approval source references', 'different package hashes', 'reserved example email domains', 'empty runtime proof and receipt arrays', 'illustrative accounting arithmetic', 'seven-page preview'], 'app_acceptance_tests_executed': False, 'terminal3_calls_made': False, 'deliveries_made': 0}

validation = validate()
(BASE / 'Fixture_Validation.json').write_text(json.dumps(validation, indent=2) + '\n', encoding='utf-8')
archive = BASE.parent / 'Mandate_Synthetic_Demo_Pack.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    for path in sorted(BASE.rglob('*')):
        if path.is_file() and '__pycache__' not in path.parts:
            z.write(path, Path('Mandate_Synthetic_Demo_Pack') / path.relative_to(BASE))
    z.write(preview, 'Mandate_Synthetic_Demo_Pack/Mandate_Demo_Preview.pdf')
print(json.dumps({'archive': str(archive), 'preview': str(preview), 'seed': str(BASE / 'Mandate_Demo_Seed.json'), 'validation': validation}, indent=2))
