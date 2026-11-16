-- Bright association palettes are the default for new stories; do not recolor existing work.
alter table public.association_stories drop constraint association_stories_theme_key_check;
alter table public.association_stories add constraint association_stories_theme_key_check check(theme_key in ('sunshine','sky','coral','mint','lavender','peach','rose','aqua','sungreen','apricot','forest','charcoal','earth','navy','wine','plum','teal','olive','slate','terracotta','indigo','emerald'));
alter table public.association_stories alter column theme_key set default 'sunshine';
