# Object Service: Strategy & Guidelines

The Object Service manages structured JSON objects (such as orders or SOAP notes) using a stateful delta model.

## Rules of Engagement
* **Template Reuse**: Always call `object_from_saved` first to see if there is an existing object template that you can reuse, saving token overhead.
* **Property set as you go**: Set fields using `object_patch` incrementally as you learn values from the user, rather than calling it with a massive payload on turn one.
* **Validation Check**: Always call `object_validate` to inspect errors and get a clean diff before finalizing.
