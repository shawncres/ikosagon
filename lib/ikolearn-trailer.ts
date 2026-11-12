/**
 * Public IkoLearn video. Off by default (SHOW_IKOLEARN_TRAILER=false).
 * Set the env var to "true" to put the trailer and the homepage loop back.
 */
export const SHOW_IKOLEARN_TRAILER = process.env.SHOW_IKOLEARN_TRAILER === "true";
