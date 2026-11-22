# frozen_string_literal: true

require "spec_helper"
require "widget"

# Three passing specs that exercise the Widget value object. The kit's
# evidence gate runs these via `bundle exec rspec`; a deliberately failing
# variant (e.g. flip an expectation) demonstrates the Red phase.
RSpec.describe Widget do
  describe "#name" do
    it "returns the stripped name" do
      expect(Widget.new(name: "  gizmo  ").name).to eq("gizmo")
    end
  end

  describe "validation" do
    it "rejects a blank name" do
      expect { Widget.new(name: "   ") }.to raise_error(ArgumentError, /name is required/)
    end

    it "rejects a nil name" do
      expect { Widget.new(name: nil) }.to raise_error(ArgumentError, /name is required/)
    end
  end
end
