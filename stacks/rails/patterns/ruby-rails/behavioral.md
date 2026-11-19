# Behavioral Patterns — Ruby / Rails

Reference: https://refactoring.guru/design-patterns/behavioral-patterns

---

## Chain of Responsibility

**Intent:** Pass a request along a chain of handlers; each handles it or passes it on.
**Use when:** Ordered checks/transforms that can short-circuit: request validation, fraud checks, discount resolution, approval workflows, support ticket routing.
**Ruby idiom:** Array of callables reduced in order; Rack middleware is the canonical Rails example.

```ruby
# app/handlers/fraud/*.rb
module Fraud
  Verdict = Data.define(:status, :reason) do
    def self.pass = new(status: :pass, reason: nil)
    def self.block(reason) = new(status: :block, reason:)
    def self.review(reason) = new(status: :review, reason:)
  end

  class Handler
    def initialize(next_handler = nil) = @next = next_handler
    def call(order) = @next ? @next.call(order) : Verdict.pass
  end

  class BlocklistCheck < Handler
    def call(order) = BlockedEmail.exists?(email: order.email) ? Verdict.block("blocklisted") : super
  end

  class VelocityCheck < Handler
    def call(order)
      Order.where(user: order.user, created_at: 1.hour.ago..).count > 5 ? Verdict.review("velocity") : super
    end
  end

  class AmountCheck < Handler
    def call(order) = order.total_cents > 5_00_000 ? Verdict.review("high value") : super
  end

  def self.chain = BlocklistCheck.new(VelocityCheck.new(AmountCheck.new))
end

Fraud.chain.call(order) # => #<data Fraud::Verdict status=:review, reason="velocity">
```

Functional variant:
```ruby
CHECKS = [->(o) { :block if o.email.end_with?("@spam.test") }, ->(o) { :review if o.total_cents > 1e6 }].freeze
verdict = CHECKS.lazy.filter_map { _1.call(order) }.first || :pass
```

Rack middleware (Rails built-in chain):
```ruby
class RequestTiming
  def initialize(app) = @app = app
  def call(env)
    t = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    status, headers, body = @app.call(env)
    headers["Server-Timing"] = "app;dur=#{((Process.clock_gettime(Process::CLOCK_MONOTONIC) - t) * 1000).round}"
    [status, headers, body]
  end
end
# config/application.rb: config.middleware.use RequestTiming
```
**RSpec:** test each handler with a spy `next_handler` (`expect(next_h).to receive(:call)` when it passes; `not_to` when it short-circuits), then one test of the assembled chain.

---

## Command

**Intent:** Encapsulate a request as an object so it can be queued, logged, retried, or undone.
**Use when:** Background work, undo/redo, audit trails, batch operations, transactional business actions.
**Ruby idiom:** Service object with `#call`; `ActiveJob` is a serialized, queueable Command.

```ruby
# app/commands/application_command.rb
class ApplicationCommand
  Result = Data.define(:ok, :value, :errors) do
    def ok? = ok
    def self.success(value = nil) = new(ok: true, value:, errors: [])
    def self.failure(*errors) = new(ok: false, value: nil, errors: errors.flatten)
  end

  def self.call(...) = new(...).call
  private
  def success(v = nil) = Result.success(v)
  def failure(*e) = Result.failure(*e)
end

# app/commands/accounts/transfer.rb
module Accounts
  class Transfer < ApplicationCommand
    def initialize(from:, to:, amount_cents:, actor:)
      @from, @to, @amount, @actor = from, to, amount_cents, actor
    end

    def call
      return failure("insufficient funds") if @from.balance_cents < @amount
      ApplicationRecord.transaction do
        @from.lock!; @to.lock!
        @from.decrement!(:balance_cents, @amount)
        @to.increment!(:balance_cents, @amount)
        entry = AuditEntry.create!(actor: @actor, action: "transfer", payload: { from: @from.id, to: @to.id, amount: @amount })
        success(entry)
      end
    end

    def undo
      self.class.new(from: @to, to: @from, amount_cents: @amount, actor: @actor).call
    end
  end
end

# Queueable command
class TransferJob < ApplicationJob
  queue_as :payments
  retry_on ActiveRecord::Deadlocked, wait: :polynomially_longer, attempts: 5
  def perform(from_id, to_id, amount_cents, actor_id)
    Accounts::Transfer.call(from: Account.find(from_id), to: Account.find(to_id), amount_cents:, actor: User.find(actor_id))
  end
end
```

Undo stack (editor-like features):
```ruby
class CommandHistory
  def initialize = @stack = []
  def execute(cmd) = cmd.call.tap { @stack.push(cmd) if _1.ok? }
  def undo = @stack.pop&.undo
end
```
**RSpec:** `expect(result).to be_ok`; check side effects with `change { from.reload.balance_cents }.by(-100)`; `have_enqueued_job(TransferJob).with(...)`.
**Pitfalls:** Pass IDs, not AR objects, to jobs if you need fresh state (GlobalID works but loads at perform time). Make commands idempotent for retries.

---

## Iterator

**Intent:** Traverse a collection without exposing its representation.
**Use when:** Custom collections, paginated API results, streaming large tables, tree traversal.
**Ruby idiom:** `include Enumerable` + define `#each`; `Enumerator.new` for external/lazy iteration; `find_each`/`in_batches` for AR.

```ruby
# Paginated external API exposed as a lazy Enumerable
class GithubRepos
  include Enumerable

  def initialize(org, client: Octokit::Client.new(access_token: ENV["GITHUB_TOKEN"]))
    @org, @client = org, client
  end

  def each
    return enum_for(:each) unless block_given?
    page = 1
    loop do
      batch = @client.org_repos(@org, per_page: 100, page:)
      break if batch.empty?
      batch.each { yield _1 }
      page += 1
    end
  end
end

GithubRepos.new("rails").lazy.select(&:fork).map(&:full_name).first(5)

# Tree iterator (depth-first) for Composite
class Category
  def each_descendant(&block)
    return enum_for(:each_descendant) unless block
    children.each { |c| yield c; c.each_descendant(&block) }
  end
end

# Huge tables: never `.all.each`
User.where(active: true).find_each(batch_size: 1_000) { SyncUserJob.perform_later(_1.id) }
```
**RSpec:** stub the client to return two pages then empty; assert `to_a.size` and that `lazy.first(1)` fetches only one page.

---

## Mediator

**Intent:** Centralize complex communication between objects so they don't reference each other.
**Use when:** Several models/services trigger each other (order ↔ inventory ↔ shipping ↔ loyalty), UI component coordination, chat rooms.
**Ruby idiom:** An orchestrator service, or `ActiveSupport::Notifications` as an event bus mediator.

```ruby
# app/services/order_lifecycle.rb
# Mediator: components never call each other directly.
class OrderLifecycle
  def initialize(inventory: Inventory::Service.new, shipping: Shipping::Service.new,
                 loyalty: Loyalty::Service.new, notifier: Notifier.new)
    @inventory, @shipping, @loyalty, @notifier = inventory, shipping, loyalty, notifier
  end

  def notify(sender, event, order)
    case event
    in :paid
      @inventory.commit(order)
      @shipping.schedule(order)
    in :shipped
      @loyalty.award_points(order)
      @notifier.shipped(order)
    in :cancelled
      @inventory.release(order)
      @shipping.cancel(order) if order.shipment
    end
  end
end

# components only know the mediator
class Shipping::Service
  def initialize(mediator: nil) = @mediator = mediator
  def mark_shipped(order) = (order.update!(status: :shipped); @mediator&.notify(self, :shipped, order))
end
```
**Pitfalls:** The mediator can become a god object — split per aggregate/bounded context. If components don't need replies, Observer (pub/sub) is looser.

---

## Memento

**Intent:** Capture and restore an object's state without violating encapsulation.
**Use when:** Undo, drafts/versions, audit history, "revert to previous" features, rollback in wizards.
**Ruby idiom:** Snapshot `attributes` into an immutable `Data`; in Rails use PaperTrail / `has_many :versions`.

```ruby
class Document < ApplicationRecord
  Snapshot = Data.define(:title, :body, :taken_at)  # memento (opaque to caretaker)

  def snapshot = Snapshot.new(title:, body:, taken_at: Time.current)
  def restore(snap) = update!(title: snap.title, body: snap.body)
end

class DocumentHistory # caretaker
  def initialize(doc, limit: 50) = (@doc, @limit, @stack = doc, limit, [])
  def checkpoint = (@stack.push(@doc.snapshot); @stack.shift if @stack.size > @limit)
  def undo = (snap = @stack.pop) && @doc.restore(snap)
end

# Persistent versions (Rails way)
class Document < ApplicationRecord
  has_paper_trail only: %i[title body]
end
doc.paper_trail.previous_version&.save!
```
**Pitfalls:** Big snapshots in memory/DB — store diffs or cap history. Don't snapshot secrets.

---

## Observer

**Intent:** Subscribers are notified when a publisher's state changes.
**Use when:** Side effects decoupled from the core action: emails, analytics, cache busting, webhooks, search indexing.
**Ruby idiom:** `ActiveSupport::Notifications` (in-process), `after_commit` (model-level), Wisper/Rails Event Store (domain events), stdlib `Observable` (POROs).

```ruby
# Publisher — emit a domain event after the transaction commits
class Order < ApplicationRecord
  after_commit :publish_paid, if: -> { saved_change_to_status?(to: "paid") }
  private def publish_paid = ActiveSupport::Notifications.instrument("order.paid", order_id: id)
end

# Subscribers — config/initializers/subscribers.rb
Rails.application.config.after_initialize do
  ActiveSupport::Notifications.subscribe("order.paid") do |event|
    OrderMailer.receipt(event.payload[:order_id]).deliver_later
  end
  ActiveSupport::Notifications.subscribe("order.paid") do |event|
    AnalyticsJob.perform_later("order_paid", event.payload)
  end
end

# PORO observer (stdlib)
require "observer"
class PriceTicker
  include Observable
  def tick(symbol, price) = (changed; notify_observers(symbol, price))
end
class AlertWatcher
  def update(symbol, price)
    puts("#{symbol} crossed #{price}") if price > 100
  end
end
PriceTicker.new.tap { _1.add_observer(AlertWatcher.new) }.tick("TCS", 120)
```
**RSpec:**
```ruby
it "publishes order.paid" do
  events = []
  sub = ActiveSupport::Notifications.subscribe("order.paid") { events << _1 }
  order.update!(status: :paid)
  expect(events.size).to eq 1
ensure
  ActiveSupport::Notifications.unsubscribe(sub)
end
```
Use `self.use_transactional_tests` default; Rails 5+ fires `after_commit` in transactional tests.
**Pitfalls:** Subscribers should enqueue jobs, not do slow work inline. `after_save` + external call = event fired for rolled-back data.

---

## State

**Intent:** Let an object change behavior when its internal state changes, as if it changed class.
**Use when:** Many `if status == ...` branches across methods; transitions with guards and side effects (orders, subscriptions, KYC, tickets).
**Avoid when:** 2–3 states with no per-state behavior — `enum` + validations is enough.
**Ruby idiom:** State classes delegated to by the model; or AASM for declarative transitions.

```ruby
# app/states/orders/base.rb
module Orders::States
  class InvalidTransition < StandardError; end

  class Base
    def initialize(order) = @order = order
    def pay!    = invalid!(:pay)
    def ship!   = invalid!(:ship)
    def cancel! = invalid!(:cancel)
    def editable? = false
    private def invalid!(event) = raise(InvalidTransition, "cannot #{event} when #{@order.status}")
    private def transition_to(status) = @order.update!(status:)
  end

  class Pending < Base
    def pay!      = transition_to(:paid)
    def cancel!   = transition_to(:cancelled)
    def editable? = true
  end

  class Paid < Base
    def ship! = (@order.update!(status: :shipped, shipped_at: Time.current); ShipmentMailer.shipped(@order).deliver_later)
    def cancel! = (Refunds::Issue.call(@order); transition_to(:cancelled))
  end

  class Shipped < Base; end
  class Cancelled < Base; end
end

class Order < ApplicationRecord
  enum :status, { pending: "pending", paid: "paid", shipped: "shipped", cancelled: "cancelled" }, validate: true
  delegate :pay!, :ship!, :cancel!, :editable?, to: :state
  def state = "Orders::States::#{status.camelize}".constantize.new(self) # status is an enum allowlist
end
```

AASM equivalent:
```ruby
include AASM
aasm column: :status do
  state :pending, initial: true
  state :paid, :shipped, :cancelled
  event(:pay)    { transitions from: :pending, to: :paid }
  event(:ship, after: :send_shipped_mail) { transitions from: :paid, to: :shipped }
  event(:cancel) { transitions from: %i[pending paid], to: :cancelled, after: :refund_if_paid }
end
```
**RSpec:** table-driven — for each state × event assert either new state or `InvalidTransition`.

---

## Strategy

**Intent:** Define a family of interchangeable algorithms, selected at runtime.
**Use when:** Pricing/discount rules, shipping calculators, export formats, ranking algorithms, auth providers.
**Ruby idiom:** Any object responding to `#call` — lambdas for simple cases, classes for complex ones.

```ruby
# app/strategies/shipping/*.rb
module Shipping
  class Flat;     def call(order) = 50_00; end
  class ByWeight; def call(order) = (order.weight_kg * 20_00).ceil; end
  class Free;     def call(_order) = 0; end
  class Express
    def initialize(base: ByWeight.new) = @base = base
    def call(order) = @base.call(order) * 2
  end

  STRATEGIES = { "flat" => Flat, "weight" => ByWeight, "free" => Free, "express" => Express }.freeze
  def self.for(order) = order.total_cents >= 99_900 ? Free.new : STRATEGIES.fetch(order.shipping_method).new
end

class Order < ApplicationRecord
  def shipping_cents(strategy: Shipping.for(self)) = strategy.call(self)
end

# Lightweight lambdas
SORTERS = {
  "popular" => ->(scope) { scope.order(sales_count: :desc) },
  "newest"  => ->(scope) { scope.order(created_at: :desc) }
}.freeze
SORTERS.fetch(params[:sort], SORTERS["newest"]).call(Product.all)
```
**RSpec:** shared example "a shipping strategy" (returns Integer ≥ 0); unit-test each; test `Shipping.for` selection separately.
**Pitfalls:** If the client must know all strategies to choose one, put selection in a factory (`Shipping.for`).

---

## Template Method

**Intent:** Define an algorithm's skeleton in a base class; subclasses override specific steps.
**Use when:** Importers/exporters, report generators, webhook handlers, ETL — same flow, different steps.
**Ruby idiom:** Base class with hooks (`raise NotImplementedError` for required, empty for optional). Rails itself does this (`ActiveJob#perform`, `ApplicationController` callbacks).

```ruby
# app/importers/base_importer.rb
class BaseImporter
  Result = Data.define(:imported, :failed)

  def self.call(io) = new(io).call

  def initialize(io) = @io = io

  def call # template method — do not override
    imported, failed = 0, []
    each_row do |row, line|
      attrs = transform(row)
      next if skip?(attrs)
      record = upsert(attrs)
      record.persisted? ? imported += 1 : failed << [line, record.errors.full_messages]
    end
    after_import(imported)
    Result.new(imported:, failed:)
  end

  private
  def each_row = raise(NotImplementedError)   # required
  def transform(_row) = raise(NotImplementedError)
  def upsert(_attrs) = raise(NotImplementedError)
  def skip?(_attrs) = false                   # optional hook
  def after_import(_count) = nil              # optional hook
end

class ProductCsvImporter < BaseImporter
  private
  def each_row(&) = CSV.new(@io, headers: true).each.with_index(2, &)
  def transform(row) = { sku: row["SKU"].strip, name: row["Name"], price_cents: (row["Price"].to_d * 100).to_i }
  def skip?(attrs) = attrs[:sku].blank?
  def upsert(attrs) = Product.find_or_initialize_by(sku: attrs[:sku]).tap { _1.update(attrs) }
  def after_import(n) = Rails.cache.delete("products/count") if n.positive?
end
```
**RSpec:** test the base with a minimal anonymous subclass (`Class.new(BaseImporter) { ... }`); test each subclass with fixture files in `spec/fixtures/files`.
**Pitfalls:** Deep inheritance trees; prefer Strategy when steps vary independently.

---

## Visitor

**Intent:** Add operations to a stable object structure without modifying its classes.
**Use when:** AST/expression trees, document export to many formats, computing tax/reports over heterogeneous line items — the set of element types is stable but operations grow.
**Ruby idiom:** Pattern matching (`case node in ...`) often replaces Visitor. Use classic double dispatch when you want operations as separate, testable classes.

```ruby
# Elements
module Doc
  Heading   = Data.define(:level, :text) { def accept(v) = v.visit_heading(self) }
  Paragraph = Data.define(:text)         { def accept(v) = v.visit_paragraph(self) }
  Image     = Data.define(:src, :alt)    { def accept(v) = v.visit_image(self) }
end

# Visitors (operations)
class HtmlVisitor
  def visit_heading(h)   = "<h#{h.level}>#{ERB::Util.h(h.text)}</h#{h.level}>"
  def visit_paragraph(p) = "<p>#{ERB::Util.h(p.text)}</p>"
  def visit_image(i)     = %(<img src="#{ERB::Util.h(i.src)}" alt="#{ERB::Util.h(i.alt)}">)
end

class WordCountVisitor
  def visit_heading(h)   = h.text.split.size
  def visit_paragraph(p) = p.text.split.size
  def visit_image(_)     = 0
end

nodes = [Doc::Heading.new(1, "Hello"), Doc::Paragraph.new("World of Ruby"), Doc::Image.new("/a.png", "A")]
nodes.map { _1.accept(HtmlVisitor.new) }.join
nodes.sum { _1.accept(WordCountVisitor.new) } # => 4

# Pattern-matching alternative (preferred for small cases)
def to_markdown(node)
  case node
  in Doc::Heading[level:, text:] then "#{'#' * level} #{text}"
  in Doc::Paragraph[text:]       then text
  in Doc::Image[src:, alt:]      then "![#{alt}](#{src})"
  end
end
```
**RSpec:** a shared example asserting every visitor implements `visit_*` for every element class (`Doc.constants`) catches missing handlers.
**Pitfalls:** Adding a new element type requires touching every visitor — use only when element types are stable.
