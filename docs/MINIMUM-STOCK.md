# Minimum stock settings

Minimum and target stock were already stored per product/location, with audited
configuration RPCs, low-stock indicators and linked Need suggestions. The full
creation page had been redirected to quick Add; it is now accessible again from
Owner desktop Inventory → Add item.

Item creation and editing show Keep minimum in stock (off for new items). Turning
it on reveals Minimum quantity; turning it off saves a null minimum. Existing
configured minimums start enabled. Target stock is optional in Owner desktop
settings. Quick stock Add has no new fields or steps. Permissions are unchanged.

Below-minimum items offer Add to Need to Purchase. Existing Pending/Ordered Needs
are opened instead of duplicated. Creating a Need remains an explicit user action.
The linked Need picker retains its target-shortfall suggestion: current 4, target
12 suggests 8. No stock is changed by editing thresholds or viewing suggestions.

No database migration is needed for this UI restoration.
