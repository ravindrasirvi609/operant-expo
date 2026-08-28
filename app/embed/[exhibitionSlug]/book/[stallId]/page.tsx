// The booking flow itself doesn't hardcode a base path or app chrome — it's already
// embed-safe. Re-export it so the /embed/{slug}/book/{stallId} route exists without
// duplicating the component.
export { default } from "@/app/(public)/exhibitions/[exhibitionSlug]/book/[stallId]/page";
