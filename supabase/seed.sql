-- OPTICOR — reference data. Idempotent (safe to run again).
-- Contains NO stores and NO users.

-- ---------------------------------------------------------------------------
-- Product types & categories (prices are placeholders, edited in Settings › Products)
-- ---------------------------------------------------------------------------
insert into public.product_types (key, label_fr, label_en, is_frame, sort) values
  ('frames',         'Montures',  'Frames',         true,  1),
  ('contact_lenses', 'Lentilles', 'Contact lenses', false, 2),
  ('accessories',    'Accessoires', 'Accessories',  false, 3)
on conflict (key) do nothing;

insert into public.product_categories (product_type_id, name, sale_price, sort)
select t.id, c.name, c.sale_price, c.sort
from (values
  ('frames',         'Catégorie A',      300.00, 1),
  ('frames',         'Catégorie B',      500.00, 2),
  ('frames',         'Catégorie C',      800.00, 3),
  ('frames',         'Catégorie D',     1200.00, 4),
  ('frames',         'Catégorie E',     1800.00, 5),
  ('contact_lenses', 'Lentilles 1 mois', 250.00, 1),
  ('contact_lenses', 'Lentilles 3 mois', 450.00, 2)
) as c (type_key, name, sale_price, sort)
join public.product_types t on t.key = c.type_key
on conflict (product_type_id, name) do nothing;

-- ---------------------------------------------------------------------------
-- Editable lists
-- ---------------------------------------------------------------------------
insert into public.settings_list_items (list_key, code, label_fr, label_en, sort) values
  -- lens types
  ('lens_types', 'single_vision', 'Unifocal',     'Single vision', 1),
  ('lens_types', 'progressive',   'Progressif',   'Progressive',   2),
  ('lens_types', 'bifocal',       'Double foyer', 'Bifocal',       3),
  ('lens_types', 'intermediate',  'Mi-distance',  'Intermediate',  4),
  -- treatments
  ('treatments', 'anti_reflective', 'Anti-reflet',             'Anti-reflective',   1),
  ('treatments', 'clear',           'Blanc',                   'Clear',             2),
  ('treatments', 'blue_light',      'Bleu (lumière bleue)',    'Blue light filter', 3),
  ('treatments', 'photochromic',    'Photochromique',          'Photochromic',      4),
  ('treatments', 'hard_coat',       'Durci',                   'Hard coat',         5),
  ('treatments', 'tinted',          'Teinté',                  'Tinted',            6),
  ('treatments', 'polarized',       'Polarisé',                'Polarized',         7),
  -- payment methods
  ('payment_methods', 'cash',     'Espèces',  'Cash',          1),
  ('payment_methods', 'card',     'Carte',    'Card',          2),
  ('payment_methods', 'cheque',   'Chèque',   'Cheque',        3),
  ('payment_methods', 'transfer', 'Virement', 'Bank transfer', 4),
  -- charge categories ('supplier_purchase' is used by the supplier payment → charge trigger)
  ('charge_categories', 'rent',              'Loyer',             'Rent',              1),
  ('charge_categories', 'electricity',       'Électricité',       'Electricity',       2),
  ('charge_categories', 'water',             'Eau',               'Water',             3),
  ('charge_categories', 'internet',          'Internet',          'Internet',          4),
  ('charge_categories', 'salaries',          'Salaires',          'Salaries',          5),
  ('charge_categories', 'supplier_purchase', 'Achat fournisseur', 'Supplier purchase', 6),
  ('charge_categories', 'lens_remake',       'Refaire verres',    'Lens remake',       7),
  ('charge_categories', 'delivery',          'Livraison',         'Delivery',          8),
  ('charge_categories', 'other',             'Autre',             'Other',             9),
  -- cancel reasons
  ('cancel_reasons', 'client_changed_mind', 'Le client a changé d''avis', 'Client changed their mind', 1),
  ('cancel_reasons', 'measurement_error',   'Erreur de mesure',           'Measurement error',         2),
  ('cancel_reasons', 'frame_unavailable',   'Monture indisponible',       'Frame unavailable',         3),
  ('cancel_reasons', 'delay_too_long',      'Délai trop long',            'Lead time too long',        4),
  ('cancel_reasons', 'other',               'Autre',                      'Other',                     5),
  -- stock adjustment reasons
  ('adjustment_reasons', 'physical_count', 'Inventaire physique', 'Physical count', 1),
  ('adjustment_reasons', 'entry_error',    'Erreur de saisie',    'Entry error',    2),
  ('adjustment_reasons', 'item_found',     'Article retrouvé',    'Item found',     3),
  ('adjustment_reasons', 'other',          'Autre',               'Other',          4),
  -- vision types
  ('vision_types', 'distance',      'VL',    'Distance (VL)',         1),
  ('vision_types', 'near',          'VP',    'Near (VP)',             2),
  ('vision_types', 'distance_near', 'VL+VP', 'Distance + near (VL+VP)', 3)
on conflict (list_key, code) do nothing;

-- ---------------------------------------------------------------------------
-- App settings
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value) values
  ('loyalty_threshold',   '{"orders": 5}'),
  ('stuck_order_days',    '{"confirmed": 3, "in_workshop": 5, "prepared": 3, "in_store": 10}'),
  ('slip_number_padding', '{"digits": 5}')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Built-in measurement fields (visibility editable in Settings › Custom fields)
-- ---------------------------------------------------------------------------
insert into public.custom_fields (key, label_fr, label_en, field_type, visibility, is_builtin, sort) values
  ('ep_re',              'EP œil droit',          'PD right eye',        'number', 'optional', true, 1),
  ('ep_le',              'EP œil gauche',         'PD left eye',         'number', 'optional', true, 2),
  ('fitting_height',     'Hauteur de montage',    'Fitting height',      'number', 'optional', true, 3),
  ('vision_type',        'Type de vision',        'Vision type',         'select', 'optional', true, 4),
  ('doctor_name',        'Médecin',               'Doctor',              'text',   'optional', true, 5),
  ('prescription_date',  'Date de l''ordonnance', 'Prescription date',   'date',   'optional', true, 6),
  ('prescription_photo', 'Photo de l''ordonnance', 'Prescription photo', 'text',   'optional', true, 7)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Charge locations: 'Général' (store/lab rows are created by trigger with each store)
-- ---------------------------------------------------------------------------
insert into public.charge_locations (label_fr, label_en, is_general, sort) values
  ('Général', 'General', true, 0)
on conflict (is_general) where is_general do nothing;

-- ---------------------------------------------------------------------------
-- Role → permission matrix (SPEC §3). Read-only in the v1 UI.
-- ---------------------------------------------------------------------------
insert into public.role_permissions (role, permission)
select r.role, p.permission
from (values ('super_admin'), ('secretary')) as r (role)
cross join (values
  ('page.orders'), ('page.new_order'), ('page.clients'), ('page.stock'), ('page.notifications'),
  ('order.create'), ('order.add_payment'), ('order.change_status'), ('order.deliver'),
  ('client.read'), ('client.create'), ('client.update_contact'), ('client.apply_discount'),
  ('stock.read')
) as p (permission)
union all
select 'super_admin', p.permission
from (values
  ('page.dashboard'), ('page.workshop'), ('page.purchases'), ('page.charges'), ('page.settings'),
  ('scope.all_stores'),
  ('order.cancel'), ('order.step_back'), ('order.free_discount'),
  ('client.set_discount'),
  ('stock.transfer'), ('stock.damage'), ('stock.adjust'),
  ('costs.read'), ('settings.manage'), ('users.manage')
) as p (permission)
on conflict (role, permission) do nothing;
