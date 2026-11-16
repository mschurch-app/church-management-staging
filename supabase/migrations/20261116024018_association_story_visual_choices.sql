-- Existing drafts keep their current style; broaden only the accepted visual choices.
alter table public.association_stories drop constraint association_stories_layout_key_check;
alter table public.association_stories add constraint association_stories_layout_key_check check(layout_key in ('balanced','focus','strip','panorama','mosaic','gallery','postcard','film'));
alter table public.association_stories drop constraint association_stories_theme_key_check;
alter table public.association_stories add constraint association_stories_theme_key_check check(theme_key in ('forest','charcoal','earth','navy','wine','plum','teal','olive','slate','terracotta','indigo','emerald'));
