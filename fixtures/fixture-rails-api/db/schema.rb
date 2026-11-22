# frozen_string_literal: true

# db/schema.rb — mirrors the CreateWidgets migration. Loaded by
# `db:prepare` / `db:schema:load` in the CI lane before RSpec runs.
ActiveRecord::Schema[8.0].define(version: 2026_11_22_000001) do
  create_table "widgets", force: :cascade do |t|
    t.string "name", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end
end
