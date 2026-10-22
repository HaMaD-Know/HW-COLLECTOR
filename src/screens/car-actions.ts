import { Eye, Heart, HeartOff, Pencil, Trash2 } from 'lucide';
import type { AppContext } from '../app/context';
import { actionSheet, confirmDialog, toast } from '../components/feedback';
import type { CarRecord } from '../types/models';

export function describeError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Confirms, deletes the record, then frees its photo if nothing else uses it. */
export async function deleteCarWithConfirm(ctx: AppContext, car: CarRecord): Promise<boolean> {
  const ok = await confirmDialog({
    title: 'Delete this car?',
    message: `"${car.name}" and its photo will be removed from this device. This cannot be undone.`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return false;
  try {
    const removed = await ctx.cars.delete(car.id);
    await ctx.db.persist();
    if (removed) await ctx.images.releaseIfUnreferenced(removed.imagePath);
    ctx.events.emit('cars-changed');
    toast(`Deleted ${car.name}`, 'success');
    return true;
  } catch (error) {
    toast(describeError(error, 'Could not delete the car.'), 'error');
    return false;
  }
}

export async function toggleWishlistFlag(ctx: AppContext, car: CarRecord): Promise<boolean> {
  const next = !car.isWishlisted;
  try {
    await ctx.cars.setWishlisted(car.id, next);
    await ctx.db.persist();
    ctx.events.emit('cars-changed');
    toast(next ? 'Flagged on your wishlist' : 'Removed from wishlist flags', 'success');
    return next;
  } catch (error) {
    toast(describeError(error), 'error');
    return car.isWishlisted;
  }
}

export async function openCarMenu(ctx: AppContext, car: CarRecord): Promise<void> {
  const choice = await actionSheet(car.name, [
    { id: 'open', label: 'View details', icon: Eye },
    { id: 'edit', label: 'Edit', icon: Pencil },
    {
      id: 'wishlist',
      label: car.isWishlisted ? 'Remove wishlist flag' : 'Flag for wishlist (want a variant/upgrade)',
      icon: car.isWishlisted ? HeartOff : Heart,
    },
    { id: 'delete', label: 'Delete', icon: Trash2, danger: true },
  ]);
  if (choice === 'open') ctx.navigate(`/car/${encodeURIComponent(car.id)}`);
  else if (choice === 'edit') ctx.navigate(`/car/${encodeURIComponent(car.id)}/edit`);
  else if (choice === 'wishlist') await toggleWishlistFlag(ctx, car);
  else if (choice === 'delete') await deleteCarWithConfirm(ctx, car);
}
