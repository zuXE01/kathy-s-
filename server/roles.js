const roleNames = Object.freeze(['customer','staff','kitchen_staff','owner','platform_admin']);
const legacyRoles = Object.freeze({admin:'owner'});
const roleSets = Object.freeze({
  workspace:['owner','platform_admin','staff','kitchen_staff'],
  orders:['owner','platform_admin','staff','kitchen_staff'],
  management:['owner','platform_admin']
});
function roleForUser(user) {
  const supplied=user?.app_metadata?.hub_role;
  return legacyRoles[supplied] || (roleNames.includes(supplied) ? supplied : 'customer');
}
function canRole(role, allowed) { return allowed.includes(role); }
function requireRole(...allowed) {
  return (req,res,next)=>canRole(req.adminRole,allowed)
    ? next()
    : res.status(403).json({error:'You do not have permission for this action.'});
}
module.exports={roleNames,roleSets,roleForUser,requireRole};
