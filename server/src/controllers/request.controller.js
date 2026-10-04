import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createRequest, listRequests, getRequest, pendingApprovals, cancelRequest,
} from '../services/requestService.js';
import { decide, retryAssignment } from '../services/approvalService.js';

export const create = asyncHandler(async (req, res) => {
  const data = await createRequest(req.user, req.body);
  res.status(201).json({ success: true, data });
});

export const list = asyncHandler(async (req, res) => {
  const { data, meta } = await listRequests(req.user, req.query);
  res.json({ success: true, data, meta });
});

export const pending = asyncHandler(async (req, res) => {
  const data = await pendingApprovals(req.user);
  res.json({ success: true, data, count: data.length });
});

export const getOne = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await getRequest(req.user, req.params.id) });
});

export const approve = asyncHandler(async (req, res) => {
  const data = await decide({ requestId: req.params.id, user: req.user, decision: 'approved', comments: req.body.comments ?? null });
  res.json({ success: true, data });
});

export const reject = asyncHandler(async (req, res) => {
  const data = await decide({ requestId: req.params.id, user: req.user, decision: 'rejected', comments: req.body.comments });
  res.json({ success: true, data });
});

export const cancel = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await cancelRequest(req.user, req.params.id) });
});

export const assign = asyncHandler(async (req, res) => {
  const { result, request } = await retryAssignment(req.params.id, req.user);
  res.json({
    success: true,
    message: result === 'waitlisted' ? 'No license available; request stays on the waitlist' : `Assigned ${result}`,
    data: request,
  });
});
