# frozen_string_literal: true

# config/boot.rb — sets up bundler. Standard Rails 8 boot file.
ENV["BUNDLE_GEMFILE"] ||= File.expand_path("../Gemfile", __dir__)
require "bundler/setup"
