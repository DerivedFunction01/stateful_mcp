# Object Service Worked Example

```
User: Create a new prescription order for Patient 123.
LLM: Calling `object_init(schema_name="prescription", session_id="s1")` -> returns "obj_1"
LLM: Calling `object_patch(object_id="obj_1", patch={patient_id: "123"})` -> returns "obj_2"
User: Set the medication to Amoxicillin and dose to 500mg.
LLM: Calling `object_patch(object_id="obj_2", patch={medication: "Amoxicillin", dose: "500mg"})` -> returns "obj_3"
LLM: Calling `object_validate(object_id="obj_3")` -> returns validation success
LLM: Calling `object_resolve(object_id="obj_3")` -> returns fully compiled object
```
This demonstrates updating properties incrementally across dialogue turns.
