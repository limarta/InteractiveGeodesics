# %%
%load_ext autoreload
%autoreload 2
# %%
import trimesh
import cotangent
import numpy as np
import scipy.sparse as sparse
import matplotlib.pyplot as plt

# Load the OBJ file
mesh = trimesh.load('../meshes/gourd.off')

# Access mesh data
V = mesh.vertices  # Vertex positions
F = mesh.faces  # Face indices 

L = cotangent.cotangent_laplacian(V,F)
A = cotangent.vertex_area(V,F)
grad = cotangent.face_grad(V,F)
div = cotangent.div(V,F)


# %%
origins = [0]
distance = cotangent.heat_method(origins, V, F, L, A, grad, div)

colors = plt.cm.viridis(distance)

mesh.visual.vertex_colors = (colors[:, :3] * 255).astype(np.uint8)

mesh.show()

# %%
