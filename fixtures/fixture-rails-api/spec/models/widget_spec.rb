# frozen_string_literal: true

require "rails_helper"

RSpec.describe Widget, type: :model do
  it "is valid with a name" do
    expect(Widget.new(name: "gizmo")).to be_valid
  end

  it "is invalid without a name" do
    widget = Widget.new(name: nil)
    expect(widget).not_to be_valid
    expect(widget.errors[:name]).to include("can't be blank")
  end
end
