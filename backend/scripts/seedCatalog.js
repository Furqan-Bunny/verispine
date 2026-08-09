#!/usr/bin/env node
/**
 * Seed the VeriSpine category catalog.
 *
 * Categories are medical equipment and machinery — the domain this marketplace
 * actually trades in. Run once against a fresh Firebase project, and safely
 * again afterwards: each category is written to a deterministic document id
 * derived from its slug, so a rerun updates rather than duplicating.
 *
 * Usage:
 *   node backend/scripts/seedCatalog.js            # write
 *   node backend/scripts/seedCatalog.js --dry-run  # show what would be written
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { admin, db } = require('../config/firebase');

const isDryRun = process.argv.includes('--dry-run');

const CATEGORIES = [
  {
    name: 'Imaging Equipment',
    slug: 'imaging-equipment',
    icon: '🩻',
    description: 'X-ray, ultrasound, C-arm, MRI and CT systems and their components.',
    subcategories: ['X-Ray Systems', 'Ultrasound', 'C-Arm & Fluoroscopy', 'MRI & CT', 'Imaging Accessories'],
  },
  {
    name: 'Surgical Instruments',
    slug: 'surgical-instruments',
    icon: '🔪',
    description: 'Hand instruments, powered surgical tools, sets and trays.',
    subcategories: ['Hand Instruments', 'Powered Tools', 'Instrument Sets', 'Endoscopy', 'Electrosurgery'],
  },
  {
    name: 'Patient Monitoring',
    slug: 'patient-monitoring',
    icon: '💓',
    description: 'Vital signs monitors, ECG, pulse oximetry and telemetry systems.',
    subcategories: ['Vital Signs Monitors', 'ECG & EKG', 'Pulse Oximetry', 'Telemetry', 'Monitor Accessories'],
  },
  {
    name: 'Rehab & Physical Therapy',
    slug: 'rehab-physical-therapy',
    icon: '🦵',
    description: 'Therapy tables, traction, modalities and exercise equipment.',
    subcategories: ['Therapy Tables', 'Traction & Decompression', 'Modalities', 'Exercise Equipment', 'Mobility Aids'],
  },
  {
    name: 'Exam Room Furniture',
    slug: 'exam-room-furniture',
    icon: '🛏️',
    description: 'Exam tables, procedure chairs, stools, carts and cabinetry.',
    subcategories: ['Exam Tables', 'Procedure Chairs', 'Stools & Seating', 'Carts & Casework', 'Lighting'],
  },
  {
    name: 'Diagnostic Devices',
    slug: 'diagnostic-devices',
    icon: '🔬',
    description: 'Point-of-care diagnostics, otoscopes, dopplers and analyzers.',
    subcategories: ['Point-of-Care Testing', 'Diagnostic Sets', 'Doppler', 'Spirometry', 'Analyzers'],
  },
  {
    name: 'Lab Equipment',
    slug: 'lab-equipment',
    icon: '🧪',
    description: 'Centrifuges, microscopes, incubators and laboratory instruments.',
    subcategories: ['Centrifuges', 'Microscopes', 'Incubators & Ovens', 'Refrigeration', 'Lab Consumables'],
  },
  {
    name: 'Sterilization',
    slug: 'sterilization',
    icon: '♨️',
    description: 'Autoclaves, ultrasonic cleaners, washers and sterilization supplies.',
    subcategories: ['Autoclaves', 'Ultrasonic Cleaners', 'Washer Disinfectors', 'Sterilization Supplies'],
  },
  {
    name: 'Consumables & Disposables',
    slug: 'consumables-disposables',
    icon: '🧤',
    description: 'Single-use supplies, PPE, dressings, needles and syringes.',
    subcategories: ['PPE', 'Dressings & Wound Care', 'Needles & Syringes', 'Drapes & Gowns', 'Exam Supplies'],
  },
  {
    name: 'Parts & Accessories',
    slug: 'parts-accessories',
    icon: '🔧',
    description: 'Replacement parts, probes, cables, batteries and service items.',
    subcategories: ['Replacement Parts', 'Probes & Transducers', 'Cables & Leads', 'Batteries & Power', 'Service Kits'],
  },
];

async function seedCategories() {
  const ts = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
  let written = 0;

  for (const [index, category] of CATEGORIES.entries()) {
    const payload = {
      ...category,
      // Ordering is explicit so the storefront does not depend on insertion order.
      displayOrder: index,
      isActive: true,
      productCount: 0,
      updatedAt: ts,
    };

    if (isDryRun) {
      console.log(`  [DRY RUN] categories/${category.slug} ← ${category.name}`);
      continue;
    }

    // Doc id = slug, so reruns update in place instead of creating duplicates.
    const ref = db.collection('categories').doc(category.slug);
    const existing = await ref.get();
    if (!existing.exists) payload.createdAt = ts;

    // merge:true preserves productCount and anything an admin edited in the UI.
    await ref.set(payload, { merge: true });
    console.log(`  ${existing.exists ? 'updated' : 'created'}  ${category.name}`);
    written++;
  }

  return written;
}

(async () => {
  try {
    if (!db) {
      console.error('Firestore is not initialised. Check FIREBASE_SERVICE_ACCOUNT in backend/.env');
      process.exit(1);
    }

    console.log(`Seeding ${CATEGORIES.length} categories${isDryRun ? ' (dry run)' : ''}...`);
    const written = await seedCategories();
    console.log(isDryRun ? 'Dry run complete — nothing written.' : `Done. ${written} categories written.`);
    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error.message);
    process.exit(1);
  }
})();

module.exports = { CATEGORIES };
