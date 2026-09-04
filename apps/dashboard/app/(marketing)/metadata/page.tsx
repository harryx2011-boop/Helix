import type { Metadata } from 'next';
import { ScanEye, FileOutput, ShieldAlert, Images } from 'lucide-react';
import { CapabilityPage } from '@/components/marketing/pages/capability-page';

export const metadata: Metadata = {
  title: 'Metadata API',
  description: 'What a PDF, Office file or photo gives away about who and what made it, ranked by risk. Or the same file back without it.',
};

/* Request and response mirror POST /metadata and /metadata/scrub in openapi.yaml. */
const REQUEST = `POST /v1/metadata
{
  "url": "https://example.com/files/photo.jpg",
  "timeout": 30000
}

# or upload directly
curl -F file=@photo.jpg /v1/metadata

# scrub: the cleaned file is the body, the report is a header
curl -F file=@photo.jpg /v1/metadata/scrub \\
     -o photo.scrubbed.jpg -D headers.txt`;

const RESPONSE = `{
  "success": true,
  "data": {
    "findings": [
      { "group": "gps",  "key": "Coordinates", "value": "51.5007, -0.1246",
        "risk": "high",   "category": "location", "removable": true },
      { "group": "exif", "key": "Artist",      "value": "j.doe@example.com",
        "risk": "high",   "category": "identity", "removable": true },
      { "group": "exif", "key": "Model",       "value": "ILCE-7M4",
        "risk": "medium", "category": "device",   "removable": true },
      { "group": "exif", "key": "Software",    "value": "Lightroom 13.2",
        "risk": "low",    "category": "software", "removable": true }
    ],
    "riskSummary": { "high": 2, "medium": 1, "low": 1 },
    "metadata": {
      "filename": "photo.jpg",
      "fileType": "jpg",
      "sizeBytes": 3120044,
      "contentHash": "9f2c…",
      "sourceUrl": "https://example.com/files/photo.jpg",
      "scannedAt": "2026-09-03T10:12:04.118Z",
      "timingMs": 142
    }
  }
}

# /metadata/scrub answers with the file; the report rides in
# X-Helix-Metadata-Report: {"removed":[…],"retained":[],"riskSummary":{…},
#   "metadata":{"bytesBefore":3120044,"bytesAfter":3104210,…}}
# X-Helix-Metadata-Removed: 4
# X-Helix-Metadata-Retained: 0`;

export default function MetadataPage() {
  return (
    <CapabilityPage
      endpoint="metadata"
      h1={['What a file gives away,', 'and a copy without it.']}
      subhead="GPS, author, device and software from photos and documents, ranked worst-first. Scrub returns the same file with the metadata gone, and names anything it could not remove."
      mock={{
        chrome: 'browser',
        label: 'photo.jpg',
        code: `high    gps      Coordinates   51.5007, -0.1246
high    exif     Artist        j.doe@example.com
medium  exif     Model         ILCE-7M4
low     exif     Software      Lightroom 13.2

riskSummary   high 2 · medium 1 · low 1

scrub →  photo.scrubbed.jpg
         removed 4 · retained 0`,
      }}
      features={[
        { icon: ScanEye, eyebrow: 'Scan', lead: 'Ranked, not listed.', body: 'Every finding carries a risk band and a category, and the list is sorted worst-first. A value that looks like an email address or a home directory raises its band.', evidence: 'findings by risk band · sample scan', meters: [
          { label: 'high', value: 34, accent: true },
          { label: 'medium', value: 41 },
          { label: 'low', value: 25 },
        ] },
        { icon: FileOutput, eyebrow: 'Scrub', lead: 'The cleaned file is the body.', body: 'No base64 envelope, so a 25 MB upload does not come back three times over. Stream it to disk; the report rides in a header.', evidence: 'X-Helix-Metadata-Report · X-Helix-Metadata-Removed' },
        { icon: ShieldAlert, eyebrow: 'What survived', lead: 'A scrub names what it could not remove.', body: 'Some formats cannot drop an entry without corrupting the file. Those come back under retained with removable: false, never silently.', evidence: '"retained": [ … ] · "removable": false' },
        { icon: Images, eyebrow: 'Six formats', lead: 'Photos and documents alike.', body: 'EXIF and GPS from JPEG and PNG, XMP and DocInfo from PDF, docProps from DOCX, PPTX and XLSX.', evidence: 'findings by category · sample scan', meterSize: 'thin', meters: [
          { label: 'identity', value: 38, accent: true },
          { label: 'location', value: 22 },
          { label: 'device', value: 17 },
          { label: 'software', value: 14 },
          { label: 'timestamp', value: 9 },
        ] },
      ]}
      request={REQUEST}
      response={RESPONSE}
    />
  );
}
