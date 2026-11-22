# frozen_string_literal: true

# CreateWidgets is the fixture's only migration. schema.rb mirrors it so
# `bin/rails db:schema:load` / `db:prepare` reproduces the table without
# running migrations.
class CreateWidgets < ActiveRecord::Migration[8.0]
  def change
    create_table :widgets do |t|
      t.string :name, null: false
      t.timestamps
    end
  end
end
