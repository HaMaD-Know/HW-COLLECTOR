import { z } from 'zod';

/**
 * Shape the model must return. Every optional fact is nullable so the model
 * has an explicit, valid way to say "unknown" instead of guessing.
 * There is intentionally no confidence score, rarity or price field.
 */
export const IdentificationSchema = z.object({
  isDiecastCar: z.boolean(),
  suggestedName: z.string(),
  manufacturer: z.string().nullable(),
  series: z.string().nullable(),
  releaseYear: z.number().int().nullable(),
  color: z.string().nullable(),
  alternatives: z.array(z.string()),
  reasoningSummary: z.string(),
  needsManualReview: z.boolean(),
});

export type Identification = z.infer<typeof IdentificationSchema>;

export const SYSTEM_PROMPT = `You identify die-cast toy cars (Hot Wheels and similar 1:64 models) from a collector's photo.

Return:
- isDiecastCar: false if the photo does not show a toy/die-cast vehicle; then leave suggestedName empty.
- suggestedName: the casting name collectors use (for example "Ford GT-40", "'67 Camaro", "Nissan Skyline GT-R (R34)"). Name the casting, not the real car's trim level, unless they are the same.
- manufacturer: the real-world vehicle maker if the casting is a licensed real car, otherwise null.
- series: only if it is legible on packaging in the photo. Otherwise null. Do not infer a series from the paint scheme.
- releaseYear: only if a year is legible on the card or base in the photo. Otherwise null. Never guess a year.
- color: the main body colour as one or two plain words (for example "Red", "Metallic Blue").
- alternatives: up to 3 other castings it could plausibly be, most likely first. Empty if you are sure.
- reasoningSummary: one or two sentences naming the visible features that support the answer.
- needsManualReview: true unless the casting is clearly identifiable from distinctive features or legible text.

Be honest about uncertainty. A shorter list of well-supported facts is better than a complete-looking guess. Never invent rarity, value or edition information.`;
