/** The one keyboard focus treatment: an accent outline that never moves layout. */
export const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** Pressable feedback: a subtle press scale, removed for reduced motion. */
export const pressable =
  "transition-[scale,transform,background-color,border-color,color,box-shadow,opacity] duration-150 ease-snappy active:scale-[0.97] motion-reduce:active:scale-100";
