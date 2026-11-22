# frozen_string_literal: true

# fixture-ruby-rspec/lib/widget.rb
#
# A simple Widget value object. This is real business logic the kit's TDD
# cycle can target: a constructor validation plus an accessor. Plain Ruby,
# no Rails, so `bundle exec rspec` boots in milliseconds with no database.
class Widget
  attr_reader :name

  # @param name [String, nil] the widget's display name
  # @raise [ArgumentError] if name is nil or blank
  def initialize(name:)
    raise ArgumentError, "name is required" if name.nil? || name.to_s.strip.empty?

    @name = name.to_s.strip
  end
end
