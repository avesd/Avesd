# Plugin data API

`@avesd/plugin-data` lets plugins describe host-persisted local data-source
types. The host owns storage, scope enforcement, revisions, and subscriptions.

Data sources are explicitly scoped to either a workspace or one dashboard.
Widgets never query sources globally: each widget input reads and updates only
the sources bound to that instance by the host.
