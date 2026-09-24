import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
const base='C:/Users/jinkg/.codex/visualizations/2026/09/23/01a0cbd0-65fa-7a60-a0d1-eeadabe9818c/';
const out='C:/Users/jinkg/Downloads/InnocenZ/InnocenZ/outputs/01a0cbd0-65fa-7a60-a0d1-eeadabe9818c/';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(base+'marketing-v6-updated.xlsx'));
const sheet=wb.worksheets.getItem('Make the Videos');
const preview=await wb.render({sheetName:'Make the Videos',range:'B152:L156',scale:1,format:'png'});
await fs.writeFile(out+'marketing-v7-before.png',new Uint8Array(await preview.arrayBuffer()));
const edits={
 C152:'PR — Where did my RM go? · Page, highlight, then speech and fitted thin frame · 44.93 s · 9:16',
 E154:'Open with the original woman unframed, then show the real PR phone flow. Keep a steady conversational pace. Show the page first, draw a single fine circle, then begin the explanation after a short viewing pause. Follow Payment, Last week, Drinks, shift and attendance, captured identifiers, matching item amounts, receipt, dispute, and weekly total. Never read amounts or identifiers aloud. Keep figures visible. Finish with the InnocenZ pay-proof takeaway.',
 E155:'Use the uploaded thin light phone frame only for app footage. Inset the whole app beneath the camera so the avatar and notification badge stay inside the rounded corners. Keep the weekly bottom tabs visible. Put captions inside the frame above those tabs, or below the evidence sheet controls, with a translucent dark backing. Draw each circle only after its field is visible and before the explanation begins. Give all text generous clearance. Clear the previous circle before the next subject or page.',
 E156:'REVIEW CUT: InnocenZ-V1-Synced-Highlights-v14.mp4. 44.93 seconds, 720 × 1280. Rebuilt from the clean real-app master. Circles are separate timed overlays, not baked old annotations. Original opener audio is retained; later speech remains an approximate synthetic voice match. Six lines were rephrased for fluent narration without spoken amounts or identifiers. Stable pace throughout. Top corners fit inside the frame.',
 E160:'0–1.9 s: original woman, unframed.\n1.9–6.4 s: Payment, then Last week.\n6.4–11.43 s: Drinks callout before the explanation, then show its details.\n11.43–17.43 s: circle shift details, then recorded attendance times before each explanation.\n17.43–23.73 s: show automatically captured order and receipt numbers without reading them.\n23.73–29.03 s: item amounts match; move the circle to the receipt before it is mentioned.\n29.03–34 s: show the available dispute action; circle it before the dispute explanation.\n34–40.93 s: weekly total; circle the full total line with clearance around all digits.\n40.93–44.93 s: InnocenZ end card.',
 E162:'Keep one comfortable conversational pace close to the opener; show the page and highlight first, then begin speech after a brief pause. Script: “Next, open Drinks to see the details behind this payment.” “Here, you can check the shift details and the recorded check-in and finish times.” “The order and receipt numbers are captured automatically and saved with the payment.” “The item amounts match the payment, with the receipt photo just below.” “If a drinks or tips amount looks wrong, you can raise a dispute.” “Back on Payment, you can see the weekly total, with supporting details for each amount.” The shown demo supports the available dispute action; do not generalize it to wages or ineligible items.'
};
for(const [cell,value] of Object.entries(edits))sheet.getRange(cell).values=[[value]];
sheet.getRange('B160:L160').format.rowHeightPx=164;
sheet.getRange('B162:L162').format.rowHeightPx=125;
wb.recalculate();
const after=await wb.render({sheetName:'Make the Videos',range:'B152:L162',scale:1,format:'png'});
await fs.writeFile(out+'marketing-v7-after.png',new Uint8Array(await after.arrayBuffer()));
await(await SpreadsheetFile.exportXlsx(wb)).save(out+'marketing-v7-updated.xlsx');
await fs.copyFile(out+'marketing-v7-updated.xlsx',base+'marketing-v7-updated.xlsx');
console.log('Saved v7. Updated only C152, E154, E155, E156, E160, E162.');


