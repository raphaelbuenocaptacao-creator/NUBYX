-- NUBYX ID profile metadata bounds
-- Prevent oversized user-controlled profile fields from becoming an abuse or
-- performance vector as the identity layer scales.
--
-- Constraints are added NOT VALID so existing legacy rows do not block rollout.
-- New inserts/updates are protected immediately after this migration is applied.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_display_name_length_chk'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_display_name_length_chk
      CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 120)
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_avatar_url_length_chk'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_avatar_url_length_chk
      CHECK (avatar_url IS NULL OR char_length(avatar_url) <= 2048)
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_wallpaper_length_chk'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_wallpaper_length_chk
      CHECK (char_length(wallpaper) BETWEEN 1 AND 80)
      NOT VALID;
  END IF;
END
$$;

COMMENT ON CONSTRAINT profiles_display_name_length_chk ON public.profiles
  IS 'NUBYX ID display names are limited to 120 characters.';
COMMENT ON CONSTRAINT profiles_avatar_url_length_chk ON public.profiles
  IS 'NUBYX ID avatar references are limited to 2048 characters.';
COMMENT ON CONSTRAINT profiles_wallpaper_length_chk ON public.profiles
  IS 'NUBYX ID wallpaper identifiers are limited to 80 characters.';
