# Owner decision: integrate the implemented harness into main

Date: 2026-09-10 (Asia/Shanghai).

## Exact owner request

> 非常好，那我们可以合并回主分支。然后我们需要改我们的 readme 吗？我们的 readme 应该是要改的，对吧？并且你在改完这些之后，跟我详细讲一下我们当前的 Ultra Builder Pro 到底怎么运行，以及和之前的区别是什么，好吗？

## Authorized work

Update the English and Chinese README to explain the implemented workflow, the differences from the preceding 5.0 foundation, session and durable checkpoint behavior, and the actual validation/release boundaries. Verify the documentation and package, then merge the existing implementation branch into local main. Explain the running system and differences to the owner.

The preceding discussion distinguishes the implemented bounded version and passed engineering checks from operational qualification. This integration preserves the recorded D repeated-benefit gap, E recovery/closeout gaps, and the final INCOMPLETE review; it does not rewrite unfinished tasks as completed. Step 8 candidate promote/reject remains a separate undecided owner choice. No runtime policy or product acceptance threshold is changed by this documentation and integration task.

Local merge is the requested effect. Push, tag, package publication and real host installation were not requested and are not performed by this decision. Keep the implementation branch and all historical evidence; do not reset or rewrite history.
